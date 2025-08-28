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

/** Always resolve sellerId from userId in token */
async function resolveSellerId(req) {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return null;
  const seller = await Seller.findOne({ userId }).select("_id");
  return seller ? String(seller._id) : null;
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

    if (!sellerName || !sellerPhone || !emailNorm || !password || !brandName) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const addr = buildAddress({ fullAddress, line1, line2, postalCode, city, state, country });
    if (!addr) {
      return res.status(400).json({ success: false, message: "Please provide complete address (line1, postalCode, city, state)." });
    }

    let user = await User.findOne({ $or: [{ email: emailNorm }, { phone: sellerPhone }] });
    if (user) return res.status(409).json({ success: false, message: "Email or Phone already registered" });

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

/* ---------------- My Profile ---------------- */
exports.getMyProfile = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(404).json({ ok: false, message: "Seller not found for this user" });

    const seller = await Seller.findById(sellerId)
      .populate("userId", "name email phone role isApproved")
      .lean();

    if (!seller) return res.status(404).json({ ok: false, message: "Seller not found" });

    const totalProducts = await Product.countDocuments({ seller: seller._id });
    const productIds = await Product.find({ seller: seller._id }).distinct("_id");
    const totalOrders = await Order.countDocuments({ "products.product": { $in: productIds } });

    res.json({
      ok: true,
      seller: {
        ...seller,
        sellerId: seller._id,
        userId: seller.userId?._id,
        email: seller.userId?.email,
        phone: seller.userId?.phone,
        role: seller.userId?.role,
      },
      stats: { totalProducts, totalOrders },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to load profile", error: err.message });
  }
};

/* ---------------- Get All Sellers (Admin) ---------------- */
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

/* ---------------- Approve / Reject Seller ---------------- */
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

    res.json({ message: "Seller approved successfully", seller, user });
  } catch (err) {
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

/* ---------------- Update Seller (by logged-in seller) ---------------- */
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

    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(404).json({ message: "Seller not found for this user" });

    const seller = await Seller.findByIdAndUpdate(sellerId, up, { new: true });
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    // Sync user fields
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

/* ---------------- My Products ---------------- */
exports.getMyProducts = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ ok: false, message: "Seller not found for this user" });
    }
    const products = await Product.find({ seller: sellerId });
    res.json({ ok: true, items: products, total: products.length });
  } catch (err) {
    console.error("GetMyProducts error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

/* ---------------- My Stats ---------------- */
exports.getMyStats = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return res.status(400).json({ message: "Seller not found for this user" });

    const productIds = await Product.find({ seller: sellerId }).distinct("_id");
    const start = dayjs().startOf("day").toDate();
    const end = dayjs().endOf("day").toDate();

    const [totalProducts, totalOrders, todayOrders, cancelledOrders, returnedOrders, deliveredOrders] = await Promise.all([
      Product.countDocuments({ seller: sellerId }),
      Order.countDocuments({ "products.product": { $in: productIds } }),
      Order.countDocuments({ "products.product": { $in: productIds }, createdAt: { $gte: start, $lte: end } }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "cancelled" }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "returned" }),
      Order.countDocuments({ "products.product": { $in: productIds }, status: "delivered" }),
    ]);

    res.json({ ok: true, sellerId, stats: { totalProducts, totalOrders, todayOrders, cancelledOrders, returnedOrders, deliveredOrders } });
  } catch (err) {
    res.status(500).json({ message: "Failed to load seller stats", error: err.message });
  }
};
/* ---------------- My Orders (seller) ---------------- */
exports.getMyOrders = async (req, res) => {
  try {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) {
      return res.status(404).json({ ok: false, message: "Seller not found for this user" });
    }

    // filters
    const { status, today, from, to, page = 1, limit = 20, sort = "-createdAt" } = req.query;

    // all product ids for this seller
    const productIds = await Product.find({ seller: sellerId }).distinct("_id");

    const q = { "products.product": { $in: productIds } };
    if (status) q.status = status;

    if (today === "true") {
      q.createdAt = {
        $gte: dayjs().startOf("day").toDate(),
        $lte: dayjs().endOf("day").toDate(),
      };
    } else if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(from);
      if (to) {
        const t = new Date(to);
        if (!isNaN(t)) t.setHours(23, 59, 59, 999);
        q.createdAt.$lte = t;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    // only select essentials:
    const projection = {
      // meta
      orderNo: 1,
      status: 1,
      createdAt: 1,

      // staff
      staffId: 1,
      staffCode: 1,

      // buyer + address
      buyerId: 1,
      buyerAddressSnapshot: 1, // if you saved snapshot at order time
      fullAddress: 1,
      city: 1,
      state: 1,
      pincode: 1,
      country: 1,

      // products (array) + single product (optional)
      products: 1,
      product: 1,
    };

    const [items, total] = await Promise.all([
      Order.find(q)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .select(projection)
        .populate("buyerId", "name shopName phone email")
        .populate("staffId", "name employeeCode")
        .populate("products.product", "productname brand finalPrice") // enrich line items
        .populate("product", "productname brand finalPrice")          // in case you use single product field
        .lean(),
      Order.countDocuments(q),
    ]);

    // Optional: normalize address so frontend can display consistently
    const normalized = items.map((o) => {
      // prefer order-time snapshot fields; fall back to order fields
      const addr = o.buyerAddressSnapshot || {
        line1: o.fullAddress || "",
        city: o.city || "",
        state: o.state || "",
        postalCode: o.pincode || "",
        country: o.country || "India",
      };

      return {
        _id: o._id,
        orderNo: o.orderNo,
        status: o.status,
        createdAt: o.createdAt,

        // staff details
        staffId: o.staffId,               // { _id, name, employeeCode } if populated
        staffCode: o.staffCode || o.staffId?.employeeCode,

        // buyer + address (only the needed fields)
        buyerId: o.buyerId,               // { _id, name, shopName, phone, email } if populated
        buyerAddressSnapshot: addr,       // normalized for UI

        // product details
        products: (o.products || []).map((li) => ({
          product: li.product,            // populated doc with productname/brand/finalPrice
          productName: li.product?.productname,
          brand: li.brand || li.product?.brand,
          quantity: li.quantity,
          price: li.price,
          total: li.total,
        })),

        // single product (if stored)
        product: o.product || undefined,
      };
    });

    return res.json({
      ok: true,
      items: normalized,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("getMyOrders error:", err);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
};

exports.getMyCancelledOrders = (req, res) => { req.query.status = "cancelled"; return exports.getMyOrders(req, res); };
exports.getMyReturnedOrders  = (req, res) => { req.query.status = "returned";  return exports.getMyOrders(req, res); };
exports.getMyDeliveredOrders = (req, res) => { req.query.status = "delivered"; return exports.getMyOrders(req, res); };
exports.getMyTodayOrders     = (req, res) => { req.query.today  = "true";      return exports.getMyOrders(req, res); };

/* ---------------- Get Disapproved Sellers (Admin) ---------------- */
exports.getDisapprovedSellers = async (req, res) => {
  try {
    const { search, city, state, from, to, sort = "createdAt", dir = "desc", page = 1, limit = 20 } = req.query;

    const filter = { $or: [{ isRejected: true }, { isActive: false }] };

    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$and = (filter.$and || []).concat([{
        $or: [
          { brandName: rx },
          { gstNumber: rx },
          { "fullAddress.city": rx },
          { "fullAddress.state": rx },
        ]
      }]);
    }
    if (city) filter["fullAddress.city"] = new RegExp(String(city).trim(), "i");
    if (state) filter["fullAddress.state"] = new RegExp(String(state).trim(), "i");

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) { toDate.setHours(23, 59, 59, 999); filter.createdAt.$lte = toDate; }
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

    res.json({ items, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch disapproved sellers", error: err.message });
  }
};

/* ---------------- Get Seller by Id (Admin/Support) ---------------- */
exports.getSellerById = async (req, res) => {
  try {
    const { id } = req.params;

    const seller = await Seller.findById(id)
      .populate("userId", "email phone role isActive isApproved")
      .lean();

    if (!seller) {
      return res.status(404).json({ ok: false, message: "Seller not found" });
    }

    return res.json({
      ok: true,
      seller: {
        ...seller,
        sellerId: seller._id,
        userId: seller.userId?._id,
        email: seller.userId?.email,
        phone: seller.userId?.phone,
        role: seller.userId?.role,
      },
    });
  } catch (err) {
    console.error("getSellerById error:", err);
    return res.status(500).json({ ok: false, message: "Failed to fetch seller" });
  }
};
