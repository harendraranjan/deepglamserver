const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Seller  = require('../models/seller.model');

/* ---------- helpers ---------- */
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toInt = v => Math.round(toNum(v));
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

// price calculator
const calc = ({ price, discountPercentage=0, discountAmount=0, gstPercentage=0, gstType='exclusive' }) => {
  const _price = toNum(price);
  const discPctAmt = _price * (toNum(discountPercentage)/100);
  theDisc = Math.max(toNum(discountAmount), discPctAmt);
  const afterDisc = Math.max(_price - theDisc, 0);

  const inclusive = String(gstType).toLowerCase() === 'inclusive';
  const gstAmtFloat = inclusive
    ? (afterDisc - (afterDisc / (1 + toNum(gstPercentage)/100)))
    : (afterDisc * toNum(gstPercentage)/100);

  const finalFloat = inclusive ? afterDisc : (afterDisc + gstAmtFloat);

  const priceAfterDiscount = toInt(afterDisc);
  const gstAmount          = toInt(gstAmtFloat);
  const finalPrice         = toInt(finalFloat);
  const discountApplied    = toInt(theDisc);

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

/** Resolve sellerId strictly from the authenticated user */
async function resolveSellerId(req) {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return null;
  const seller = await Seller.findOne({ userId }).select('_id');
  return seller ? String(seller._id) : null;
}

/* ---------------------------------------
   CREATE PRODUCT (always disapproved initially)
   - no sellerId in body/header; always derive from token user
----------------------------------------*/
exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory, subCategory, productType, productname,
      hsnCode, MOQ, purchasePrice, margin = 0,
      discountPercentage = 0, discountAmount = 0, gstPercentage = 0, gstType = 'exclusive',
      sizes, colors, brand, stock,
      // sellerId,  // ❌ ignored now
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

    // 🔒 always resolve seller from logged-in user
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(400).json({ message: 'Seller not found for this user' });

    // integers & price calculations
    const purchase   = toInt(purchasePrice);
    const marginNum  = toNum(margin);
    const basePrice  = toInt(purchase + (marginNum / 100) * purchase);

    const { priceAfterDiscount, gstAmount, finalPrice, discountApplied } = calc({
      price: basePrice,
      discountPercentage,
      discountAmount,
      gstPercentage,
      gstType
    });

    const payload = {
      seller: sellerId,
      mainCategory,
      subCategory,
      productType: productType ? String(productType).toLowerCase() : undefined,
      productname,
      hsnCode,
      MOQ: toInt(MOQ),
      purchasePrice: purchase,
      margin: toNum(margin),
      mrp: basePrice,
      discountPercentage: toNum(discountPercentage),
      discountAmount: discountApplied,
      gstPercentage: toNum(gstPercentage),
      gstAmount,
      gstType,
      finalPrice,
      sizes: toStringArray(sizes),
      colors: toStringArray(colors),
      brand,
      stock: toInt(stock),
      mainImage: toImageObj(mainImage),
      images: toImageObjArray(images),
      description: description ? String(description).trim() : "",
      status: "disapproved", // force disapproved initially
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
   UPDATE PRODUCT
   (kept same; if you want to restrict to owner, add a seller check)
----------------------------------------*/
exports.updateProduct = async (req, res) => {
  try {
    const up = { ...req.body };

    ['purchasePrice','discountAmount','gstAmount','finalPrice','mrp','stock','MOQ','gstPercentage','discountPercentage']
      .forEach(k => { if (up[k] != null) up[k] = toInt(up[k]); });

    const priceInputs = ['purchasePrice','margin','discountPercentage','discountAmount','gstPercentage','gstType','mrp'];
    const shouldRecalc = priceInputs.some(k => k in up);

    if (shouldRecalc) {
      const current = await Product.findById(req.params.id)
        .select('purchasePrice margin mrp gstType gstPercentage discountPercentage discountAmount');
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

    if (up.mainImage) up.mainImage = toImageObj(up.mainImage);
    if (up.images)    up.images    = toImageObjArray(up.images);

    // (Optional) Ownership guard — uncomment to restrict updates to own products
    // const sellerId = await resolveSellerId(req);
    // if (!sellerId) return res.status(400).json({ message: 'Seller not found for this user' });
    // const owned = await Product.findOne({ _id: req.params.id, seller: sellerId }).select('_id');
    // if (!owned) return res.status(403).json({ message: 'Forbidden: cannot modify another seller’s product' });

    const updated = await Product.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated", product: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

/* ---------------------------------------
   LIST / FILTER PRODUCTS
----------------------------------------*/
exports.getAllProducts = async (req, res) => {
  try {
    const { approved } = req.query;
    const filter = {};

    if (approved === "true")  filter.status = "approved";
    if (approved === "false") filter.status = "disapproved";

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
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
   APPROVE / CLONE PRODUCT
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
      status: "disapproved",
    });

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

/* ---------------------------------------
   GET PRODUCT BY ID
----------------------------------------*/
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ ok: false, message: "Product ID is required" });

    const product = await Product.findById(id)
      .populate("seller", "brandName userId")
      .lean();

    if (!product) return res.status(404).json({ ok: false, message: "Product not found" });
    if (product.finalPrice !== undefined) product.finalPrice = Math.floor(product.finalPrice);

    res.json({ ok: true, product });
  } catch (err) {
    console.error("getProductById error:", err);
    res.status(500).json({ ok: false, message: "Failed to fetch product", error: err.message });
  }
};
