// controllers/product.controller.js
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Seller = require('../models/seller.model');

/* ---------- helpers ---------- */
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toInt = v => Math.round(toNum(v));                // 👈 integers only
const toStringArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    try { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr.map(String).map(x=>x.trim()).filter(Boolean); } catch {}
    return s.split(',').map(x=>x.trim()).filter(Boolean);
  }
  return [];
};

// price calculator (returns integers)
const calc = ({ price, discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive' }) => {
  const _price = toNum(price);
  const discPctAmt = _price * (toNum(discountPercentage)/100);
  const disc = Math.max(toNum(discountAmount), discPctAmt);
  const afterDisc = Math.max(_price - disc, 0);

  const inclusive = String(gstType).toLowerCase() === 'inclusive';
  const gstAmtFloat = inclusive
    ? (afterDisc - (afterDisc / (1 + toNum(gstPercentage)/100)))
    : (afterDisc * toNum(gstPercentage)/100);

  const finalFloat = inclusive ? afterDisc : (afterDisc + gstAmtFloat);

  // 👇 force integers everywhere
  const priceAfterDiscount = toInt(afterDisc);
  const gstAmount          = toInt(gstAmtFloat);
  const finalPrice         = toInt(finalFloat);
  const discountApplied    = toInt(disc);

  return { priceAfterDiscount, gstAmount, finalPrice, discountApplied };
};

// images
const toImageObj = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return { url: v };
  if (v && typeof v === 'object' && v.url) return { url: v.url };
  return null;
};
const toImageObjArray = (arr) => (Array.isArray(arr) ? arr.map(toImageObj).filter(Boolean) : []);

/* ---------------------------------------
   CREATE (always needs approval)
----------------------------------------*/
exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory, subCategory, productType, productname,
      hsnCode, MOQ, purchasePrice, margin = 0,
      discountPercentage = 0, discountAmount = 0, gstPercentage = 0, gstType = 'exclusive',
      sizes, colors, brand, stock,
      sellerId,                         // can come from body
      mainImage,
      images = [],
      description,
    } = req.body;

    if (!productname)   return res.status(400).json({ message: 'productname is required' });
    if (!mainCategory)  return res.status(400).json({ message: 'mainCategory is required' });
    if (!subCategory)   return res.status(400).json({ message: 'subCategory is required' });
    if (purchasePrice === undefined || purchasePrice === null)
      return res.status(400).json({ message: 'purchasePrice is required' });
    if (!mainImage)     return res.status(400).json({ message: 'mainImage URL is required' });

    // resolve seller (body > header > user.seller)
    let seller = sellerId || req.headers['x-seller-id'] || null;
    if (!seller && req.user?._id) {
      const s = await Seller.findOne({ userId: req.user._id }).select('_id');
      if (s) seller = s._id;
    }
    if (!seller) return res.status(400).json({ message: 'sellerId (or x-seller-id) is required' });
    if (!mongoose.isValidObjectId(seller)) return res.status(400).json({ message: 'Invalid seller id format' });

    // integers only
    const purchase = toInt(purchasePrice);
    const marginNum = toNum(margin);
    const basePriceFloat = purchase + (marginNum / 100) * purchase;
    const basePrice = toInt(basePriceFloat);

    const { priceAfterDiscount, gstAmount, finalPrice, discountApplied } = calc({
      price: basePrice,
      discountPercentage,
      discountAmount,
      gstPercentage,
      gstType
    });

    const payload = {
      seller,                                // NOTE: model ref ideally "Seller"
      mainCategory,
      subCategory,
      productType: productType ? String(productType).toLowerCase() : undefined,
      productname,
      hsnCode,
      MOQ: toInt(MOQ),
      purchasePrice: purchase,
      margin: toNum(margin),                 // keep % as number (can be decimal)
      mrp: basePrice,
      discountPercentage: toNum(discountPercentage),
      discountAmount: discountApplied,       // integer
      gstPercentage: toNum(gstPercentage),
      gstAmount,                             // integer
      gstType,
      finalPrice,                            // integer
      sizes: toStringArray(sizes),
      colors: toStringArray(colors),
      brand,
      stock: toInt(stock),

      mainImage: toImageObj(mainImage),
      images: toImageObjArray(images),

      description: description ? String(description).trim() : "",
      // 👇 NEW: every product must be approved → start as disapproved
      status: "disapproved",
      isActive: true,
    };

    if (!payload.mainImage) return res.status(400).json({ message: 'mainImage must be a URL string or { url }' });

    const saved = await Product.create(payload);
    return res.status(201).json({ message: 'Product created (pending approval)', product: saved });
  } catch (err) {
    console.error('❌ Product creation error:', err);
    return res.status(500).json({ message: 'Product creation failed', error: err.message });
  }
};

/* ---------------------------------------
   UPDATE (recalculate & force integers)
----------------------------------------*/
exports.updateProduct = async (req, res) => {
  try {
    const up = { ...req.body };

    // normalize numeric → integers
    ['purchasePrice','discountAmount','gstAmount','finalPrice','mrp','stock','MOQ','gstPercentage','discountPercentage']
      .forEach(k => { if (up[k] != null) up[k] = toInt(up[k]); });

    // if price-affecting fields present → recalc
    const priceInputs = ['purchasePrice','margin','discountPercentage','discountAmount','gstPercentage','gstType','mrp'];
    const shouldRecalc = priceInputs.some(k => k in up);

    if (shouldRecalc) {
      // base: mrp if given else purchase+margin
      const current = await Product.findById(req.params.id).select('purchasePrice margin mrp gstType gstPercentage discountPercentage discountAmount');
      if (!current) return res.status(404).json({ message: "Product not found" });

      const purchase   = up.purchasePrice != null ? toInt(up.purchasePrice) : toInt(current.purchasePrice);
      const marginNum  = up.margin != null ? toNum(up.margin) : toNum(current.margin);
      const basePrice  = up.mrp != null ? toInt(up.mrp) : toInt(purchase + (marginNum/100) * purchase);

      const discountPercentage = up.discountPercentage != null ? toNum(up.discountPercentage) : toNum(current.discountPercentage);
      const discountAmount     = up.discountAmount != null ? toNum(up.discountAmount) : toNum(current.discountAmount);
      const gstPercentage      = up.gstPercentage != null ? toNum(up.gstPercentage) : toNum(current.gstPercentage);
      const gstType            = up.gstType != null ? up.gstType : current.gstType;

      const { priceAfterDiscount, gstAmount, finalPrice, discountApplied } = calc({
        price: basePrice, discountPercentage, discountAmount, gstPercentage, gstType
      });

      up.mrp            = basePrice;
      up.discountAmount = discountApplied;
      up.gstAmount      = gstAmount;
      up.finalPrice     = finalPrice;
    }

    // images normalize
    if (up.mainImage) up.mainImage = toImageObj(up.mainImage);
    if (up.images)    up.images    = toImageObjArray(up.images);

    const updated = await Product.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated", product: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

/* ---------------------------------------
   LISTS with approval filters (status)
----------------------------------------*/
exports.getAllProducts = async (req, res) => {
  try {
    const { approved } = req.query; // "true" | "false" | undefined
    const filter = {};

    // map approved → status
    if (approved === "true")  filter.status = "approved";
    if (approved === "false") filter.status = "disapproved";

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};

// server/controllers/product.controller.js (snippet)
exports.getMyProducts = async (req, res) => {
  try {
    const sellerId = req.user.sellerId || req.user._id; // ensure auth sets this
    const { q, status, sort = "-createdAt", page = 1, limit = 12 } = req.query;

    const filter = { seller: sellerId }; // 👈 your model has field `seller`
    if (status) filter.status = status;

    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [
        { productname: rx },
        { brand: rx },
        { hsn: rx },
        { hsnCode: rx },
      ];
    }

    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 12;
    const skip = (p - 1) * l;

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(l).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({ ok: true, total, items });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to fetch products", error: e.message });
  }
};


exports.getDisapprovedProducts = async (req, res) => {
  try {
    const products = await Product.find({ status: "disapproved" }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch disapproved products", error: err.message });
  }
};

/* ---------------------------------------
   APPROVE / CLONE
----------------------------------------*/
exports.approveProduct = async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: "Product not found" });
    p.status = "approved";
    await p.save();
    res.json({ message: "Product approved", product: p });
  } catch (err) {
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

exports.cloneProduct = async (req, res) => {
  try {
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Product not found" });

    const clone = new Product({
      ...original._doc,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      status: "disapproved", // cloned product also needs approval
    });

    // force integer amounts on clone as well
    clone.purchasePrice  = toInt(clone.purchasePrice);
    clone.mrp            = toInt(clone.mrp);
    clone.discountAmount = toInt(clone.discountAmount);
    clone.gstAmount      = toInt(clone.gstAmount);
    clone.finalPrice     = toInt(clone.finalPrice);
    clone.stock          = toInt(clone.stock);
    clone.MOQ            = toInt(clone.MOQ);

    await clone.save();
    res.status(201).json({ message: "Product cloned (pending approval)", product: clone });
  } catch (err) {
    res.status(500).json({ message: "Clone failed", error: err.message });
  }
};

// ---------- Get Product By ID ----------
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // validate
    if (!id) return res.status(400).json({ ok: false, message: "Product ID is required" });

    const product = await Product.findById(id)
      .populate("seller", "brandName userId")
      .lean();

    if (!product) {
      return res.status(404).json({ ok: false, message: "Product not found" });
    }

    // Round off finalAmount or any total field (no decimal)
    if (product.finalPrice !== undefined) {
      product.finalPrice = Math.floor(product.finalPrice);
    }

    res.json({ ok: true, product });
  } catch (err) {
    console.error("getProductById error:", err);
    res.status(500).json({ ok: false, message: "Failed to fetch product", error: err.message });
  }
};
