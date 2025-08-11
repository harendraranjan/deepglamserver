const Product = require("../models/product.model");
const cloudinary = require('../config/cloudinary');

// 🆕 Create Product

/*
// 🔢 Utility: Calculate Final Price
const calculateFinalPrice = ({
  purchasePrice,
  margin = 0,
  discountPercentage = 0,
  gstPercentage = 0,
  gstType = 'exclusive',
}) => {
  const basePrice = purchasePrice + (margin / 100) * purchasePrice;
  const discountAmount = (discountPercentage / 100) * basePrice;
  const priceAfterDiscount = basePrice - discountAmount;

  const gstAmount =
    gstType === 'exclusive' ? (gstPercentage / 100) * priceAfterDiscount : 0;

  const finalPrice = priceAfterDiscount + gstAmount;

  return { basePrice, discountAmount, gstAmount, finalPrice };
};
*/
// helper: multer file -> { url, public_id }
//const toImage = f => (f ? { url: f.path, public_id: f.filename || null } : null);

exports.createProduct = async (req, res) => {
  try {
    const {
      mainCategory,
      subCategory,
      productType,
      productname,
      gender,
      hsnCode,
      MOQ,
      purchasePrice,
      margin = 0,
      discountPercentage = 0,
      discountAmount = 0,
      gstPercentage = 0,
      gstType = "exclusive",
      sizes,
      colors,
      brand,
      stock,
      sellerId,
      mainImage, // JSON me direct URL
      images = [] // JSON me URLs ka array
    } = req.body;

    // Calculate base price
    const basePrice = Number(purchasePrice) + (Number(margin) / 100) * Number(purchasePrice);

    // Price calculation
    const { priceAfterDiscount, gstAmount, finalPrice } = calculateFinalPrice({
      price: basePrice,
      discountPercentage: Number(discountPercentage),
      discountAmount: Number(discountAmount),
      gstPercentage: Number(gstPercentage),
      gstType,
    });

    // Parse arrays if strings
    const parsedSizes = typeof sizes === "string" ? JSON.parse(sizes) : sizes;
    const parsedColors = typeof colors === "string" ? JSON.parse(colors) : colors;

    const newProduct = new Product({
      seller: req.user?._id || sellerId || null,
      mainCategory,
      subCategory,
      productType: productType?.toLowerCase(),
      productname,
      gender: gender?.toLowerCase(),
      hsnCode,
      MOQ: Number(MOQ) || 0,
      purchasePrice: Number(purchasePrice) || 0,
      margin: Number(margin) || 0,
      mrp: basePrice,
      discountPercentage: Number(discountPercentage) || 0,
      discountAmount: priceAfterDiscount < basePrice ? basePrice - priceAfterDiscount : 0,
      gstPercentage: Number(gstPercentage) || 0,
      gstAmount,
      gstType,
      finalPrice,
      sizes: parsedSizes || [],
      colors: parsedColors || [],
      brand,
      stock: Number(stock) || 0,
      mainImage, // direct URL
      images, // URLs array
      isApproved: false,
      isActive: true,
    });

    const saved = await newProduct.save();
    res.status(201).json({ message: "Product created", product: saved });

  } catch (err) {
    console.error("❌ Product creation error:", err);
    res.status(500).json({ message: "Product creation failed", error: err.message });
  }
};


// ✏️ Update Product
exports.updateProduct = async (req, res) => {
  try {
    const updates = req.body;
    if (updates.price || updates.discountPercentage || updates.discountAmount || updates.gstPercentage) {
      const calc = calculateFinalPrice({
        price: updates.price,
        discountPercentage: updates.discountPercentage,
        discountAmount: updates.discountAmount,
        gstPercentage: updates.gstPercentage,
        gstType: updates.gstType,
      });
      updates.finalPrice = calc.finalPrice;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ message: "Product updated", product: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

// ❌ Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};

// 📄 Get all products (admin/seller/buyer) with optional approval filter
exports.getAllProducts = async (req, res) => {
  try {
    const { approved } = req.query; // Query parameter for filtering approval status
    const filter = {};

    if (approved === "true") {
      filter.isApproved = true;
    } else if (approved === "false") {
      filter.isApproved = false;
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products", error: err.message });
  }
};


// 👤 Get single product
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product", error: err.message });
  }
};
// 📄 Get all disapproved (not approved) products
exports.getDisapprovedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isApproved: false }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch disapproved products", error: err.message });
  }
};


// ✅ Approve Product (admin)
exports.approveProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.status = "approved";
    await product.save();

    res.json({ message: "Product approved" });
  } catch (err) {
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

// 🌀 Clone Product
exports.cloneProduct = async (req, res) => {
  try {
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Product not found" });

    const clone = new Product({
      ...original._doc,
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      status: "pending",
    });

    await clone.save();
    res.status(201).json({ message: "Product cloned", product: clone });
  } catch (err) {
    res.status(500).json({ message: "Clone failed", error: err.message });
  }
};

// 💰 Utility: Final price calculator
function calculateFinalPrice({ price, discountPercentage = 0, discountAmount = 0, gstPercentage = 0, gstType = "exclusive" }) {
  let priceAfterDiscount = price;

  if (discountPercentage) {
    priceAfterDiscount -= (discountPercentage / 100) * price;
  } else if (discountAmount) {
    priceAfterDiscount -= discountAmount;
  }

  const gstAmount = gstType === "exclusive" ? (gstPercentage / 100) * priceAfterDiscount : 0;
  const finalPrice = priceAfterDiscount + gstAmount;

  return {
    priceAfterDiscount,
    gstAmount,
    finalPrice,
  };
}
