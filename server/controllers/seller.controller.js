// server/controllers/seller.controller.js
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const mongoose = require("mongoose");

const Seller = require("../models/seller.model");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const Order = require("../models/order.model");

/* ---------------- Helpers ---------------- */
const parseMaybeJSON = (val) => {
  if (!val) return undefined;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return undefined; }
};
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : undefined);
function buildAddress({ fullAddress, line1, line2, postalCode, city, state, country }) {
  let addr = parseMaybeJSON(fullAddress);
  if (!addr) addr = { line1, line2, postalCode, city, state, country: country || "India" };
  if (!addr?.line1 || !addr?.postalCode || !addr?.city || !addr?.state) return null;
  if (!addr.country) addr.country = "India";
  return addr;
}
async function resolveSellerId(req) {
  let sellerId = req.headers["x-seller-id"] || req.query.sellerId || null;
  if (!sellerId && req.user?._id) {
    const s = await Seller.findOne({ userId: req.user._id }).select("_id");
    if (s) sellerId = s._id;
  }
  return sellerId;
}

/* ---------------- Create Seller ---------------- */
exports.createSeller = async (req, res) => {
  try {
    const {
      name, phone, mobile, email, password,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl,
    } = req.body;

    const sellerName = name;
    const sellerPhone = mobile || phone;
    const emailNorm = normEmail(email);

    if (!sellerName || !sellerPhone || !emailNorm || !password || !brandName ) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (!addr) {
      return res.status(400).json({ success: false, message: "Please provide complete address (line1, postalCode, city, state)." });
    }

    // Duplicate user check
    let user = await User.findOne({ $or: [{ email: emailNorm }, { phone: sellerPhone }] });
    if (user) return res.status(409).json({ success: false, message: "Email or Phone already registered" });

    // Create user
    const hash = await bcrypt.hash(password, 10);
    user = await User.create({
      name: sellerName,
      email: emailNorm,
      phone: sellerPhone,
      password: hash,
      role: "seller",
      fullAddress: addr,
      isApproved: false,
    });

    // Create seller profile (awaiting approval)
    const seller = await Seller.create({
      userId: user._id,
      brandName,
      gstNumber,
      fullAddress: addr,
      aadhaarCard: {
        front: { url: aadhaarFrontUrl || undefined },
        back: { url: aadhaarBackUrl || undefined },
      },
      isActive: false,
    });

    res.status(201).json({ success: true, message: "Seller created, waiting for approval", seller });
  } catch (error) {
    console.error("Seller creation failed:", error);
    res.status(500).json({ success: false, message: "Seller creation failed", error: error.message });
  }
};


/* ---------------- Profile (counts) ---------------- */
exports.getMyProfile = async (req, res) => {
  try {
    let sellerId = req.headers["x-seller-id"] || req.query.sellerId || null;

    if (!sellerId && req.user?._id) {
      const s = await Seller.findOne({ userId: req.user._id }).select("_id brandName");
      if (s) sellerId = s._id;
    }
    if (!sellerId) return res.status(400).json({ message: "Seller not found for this user" });
    if (!mongoose.isValidObjectId(sellerId)) return res.status(400).json({ message: "Invalid seller id" });

    const [totalProducts, productIds] = await Promise.all([
      Product.countDocuments({ seller: sellerId }),
      Product.find({ seller: sellerId }).distinct("_id"),
    ]);

    const totalOrders = await Order.countDocuments({ "products.product": { $in: productIds } });

    return res.json({ ok: true, sellerId, stats: { totalProducts, totalOrders } });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load seller profile", error: e.message });
  }
};

/* ---------------- All Sellers (admin) ---------------- */
exports.getAllSellers = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status === "approved") filter.isActive = true;
    if (status === "pending") filter.isActive = false;

    const sellers = await Seller.find(filter)
      .populate("userId", "name email phone isApproved")
      .sort({ createdAt: -1 });

    res.json(sellers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sellers", error: err.message });
  }
};

/* ---------------- Approvals ---------------- */
exports.approveSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    const user = await User.findById(seller.userId);
    if (!user) return res.status(404).json({ message: "User not found for this seller" });

    seller.isActive = true;
    await seller.save();
    user.isApproved = true;
    await user.save();

    res.status(200).json({ message: "Seller approved successfully", seller, user });
  } catch (err) {
    console.error("approveSeller error:", err);
    res.status(500).json({ message: "Failed to approve seller", error: err.message });
  }
};

exports.rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    seller.isActive = false;
    seller.isRejected = true;
    seller.rejectReason = reason;
    await seller.save();

    await User.findByIdAndUpdate(seller.userId, { isApproved: false });
    res.json({ message: "Seller rejected" });
  } catch (err) {
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};

/* ---------------- Update Seller ---------------- */
exports.updateSeller = async (req, res) => {
  try {
    const {
      name, fullName, phone, mobile, email,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl
    } = req.body;

    const up = {};
    if (brandName) up.brandName = brandName;
    if (gstNumber) up.gstNumber = gstNumber;

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (addr) up.fullAddress = addr;

    if (aadhaarFrontUrl || aadhaarBackUrl) {
      up.aadhaarCard = {
        ...(aadhaarFrontUrl ? { front: { url: aadhaarFrontUrl } } : {}),
        ...(aadhaarBackUrl ? { back: { url: aadhaarBackUrl } } : {}),
      };
    }

    const seller = await Seller.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    // Sync user
    if (name || fullName || phone || mobile || email) {
      const userPatch = {};
      if (name || fullName) userPatch.name = fullName || name;
      if (phone || mobile) userPatch.phone = mobile || phone;
      if (email) userPatch.email = normEmail(email);
      await User.findByIdAndUpdate(seller.userId, userPatch, { new: true });
    }

    res.json({ message: "Seller updated", seller });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

/* ---------------- Seller: My Products (list) ---------------- *//*
exports.getMyProducts = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(400).json({ message: "Seller not found for this user" });

    const { q, page = 1, limit = 20 } = req.query;
    const filter = { seller: sellerId };
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { productname: rx },
        { brand: rx },
        { sku: rx },
        { hsn: rx },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("productname brand sku finalPrice mrp createdAt"),
      Product.countDocuments(filter),
    ]);

    return res.json({ ok: true, page: Number(page), limit: Number(limit), total, items });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch products", error: e.message });
  }
};
*/


exports.getMyProducts = async (req, res) => {
  try {
    // --- figure out sellerId safely ---
    let sellerId = req.user?.sellerId || req.user?._id;

    // If token doesn’t carry sellerId, allow fallback via query/header
    if (!sellerId) {
      sellerId = req.query.sellerId || req.headers["x-seller-id"];
    }

    // If still missing, try mapping from userId → seller
    if (!sellerId && req.user?._id) {
      const found = await Seller.findOne({ userId: req.user._id }, { _id: 1 });
      if (found) sellerId = String(found._id);
    }

    if (!sellerId || !mongoose.isValidObjectId(String(sellerId))) {
      return res
        .status(400)
        .json({ ok: false, message: "sellerId not resolved for current user" });
    }

    // --- filters / pagination ---
    const {
      page = 1,
      limit = 20,
      q,
      status,          // "approved" | "pending" | "rejected" | "oos"
      sort = "-createdAt",
      includeInactive, // if truthy, don't force isActive=true
    } = req.query;

    const toInt = (v, d) => (isNaN(parseInt(v, 10)) ? d : parseInt(v, 10));
    const skip = (toInt(page, 1) - 1) * toInt(limit, 20);

    const filter = { seller: sellerId };
    if (!includeInactive) filter.isActive = true;

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { productname: rx },
        { brand: rx },
        { hsn: rx },
        { hsnCode: rx },
      ];
    }

    if (status) {
      if (status === "oos") filter.stock = { $lte: 0 };
      else filter.status = status; // approved/pending/rejected
    }

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(toInt(limit, 20))
        .select(
          "productname brand stock status finalPrice mrp purchasePrice mainImage images hsn hsnCode createdAt"
        )
        .lean(),
      Product.countDocuments(filter),
    ]);

    // ✅ Return shape compatible with frontend
    return res.json({
      ok: true,
      items,
      total,
      page: toInt(page, 1),
      limit: toInt(limit, 20),
    });
  } catch (err) {
    console.error("getMyProducts error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch products",
      error: err.message,
    });
  }
};

/* ---------------- Seller: Dashboard Stats ---------------- */
exports.getMyStats = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(400).json({ message: "Seller not found for this user" });

    const productIds = await Product.find({ seller: sellerId }).distinct("_id");
    const start = dayjs().startOf("day").toDate();
    const end = dayjs().endOf("day").toDate();

    const [
      totalProducts, totalOrders, todayOrders,
      cancelledOrders, returnedOrders, deliveredOrders
    ] = await Promise.all([
      Product.countDocuments({ seller: sellerId }),
      Order.countDocuments({ "products.product": { $in: productIds } }),
      Order.countDocuments({ "products.product": { $in: productIds }, createdAt: { $gte: start, $lte: end } }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "cancelled" }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "returned" }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "delivered" }),
    ]);

    return res.json({
      ok: true,
      sellerId,
      stats: { totalProducts, totalOrders, todayOrders, cancelledOrders, returnedOrders, deliveredOrders }
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load seller stats", error: e.message });
  }
};

/* ---------------- Seller: My Orders (filters) ---------------- */
exports.getMyOrders = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(400).json({ message: "Seller not found for this user" });

    const { status, today, from, to, page = 1, limit = 20 } = req.query;
    const productIds = await Product.find({ seller: sellerId }).distinct("_id");

    const q = { "products.product": { $in: productIds } };
    if (status) q.status = status;

    if (today === "true") {
      q.createdAt = { $gte: dayjs().startOf("day").toDate(), $lte: dayjs().endOf("day").toDate() };
    } else if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        q.createdAt.$lte = t;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Order.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("orderNo status finalAmount totalAmount invoiceUrl createdAt buyerId")
        .populate("buyerId", "name phone email"),
      Order.countDocuments(q),
    ]);

    res.json({ ok: true, page: Number(page), limit: Number(limit), total, items });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch seller orders", error: e.message });
  }
};

/* ---------------- Shortcuts ---------------- */
exports.getMyCancelledOrders = (req, res) => {
  req.query.status = "cancelled";
  return exports.getMyOrders(req, res);
};
exports.getMyReturnedOrders = (req, res) => {
  req.query.status = "returned";
  return exports.getMyOrders(req, res);
};
exports.getMyDeliveredOrders = (req, res) => {
  req.query.status = "delivered";
  return exports.getMyOrders(req, res);
};
exports.getMyTodayOrders = (req, res) => {
  req.query.today = "true";
  return exports.getMyOrders(req, res);
};

/* ---------------- Admin: Disapproved list (enhanced) ---------------- */
exports.getDisapprovedSellers = async (req, res) => {
  try {
    const {
      search, city, state, from, to,
      sort = "createdAt", dir = "desc",
      page = 1, limit = 20,
    } = req.query;

    const filter = { $or: [{ isRejected: true }, { isActive: false }] };

    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$and = (filter.$and || []).concat([{
        $or: [
          { brandName: rx },
          { gstNumber: rx },
          { "fullAddress.city": rx },
          { "fullAddress.state": rx },
        ],
      }]);
    }
    if (city) filter["fullAddress.city"] = new RegExp(String(city).trim(), "i");
    if (state) filter["fullAddress.state"] = new RegExp(String(state).trim(), "i");

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) {
          toDate.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = toDate;
        }
      }
    }

    const sortSpec = { [sort]: String(dir).toLowerCase() === "asc" ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Seller.find(filter)
        .populate("userId", "name email phone isApproved")
        .sort(sortSpec)
        .skip(skip)
        .limit(Number(limit)),
      Seller.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page: Number(page),
      pages: Math.max(1, Math.ceil(total / Number(limit))),
    });
  } catch (err) {
    console.error("getDisapprovedSellers error:", err);
    return res.status(500).json({ message: "Failed to fetch disapproved sellers", error: err.message });
  }
};

/* ---------------- Get Seller by ID ---------------- */
exports.getSellerById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).populate("userId");
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};
