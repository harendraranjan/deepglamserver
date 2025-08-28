// controllers/buyer.controller.js
const mongoose = require("mongoose");
const Buyer = require("../models/buyer.model");
const User = require("../models/user.model");
const Staff = require("../models/staff.model");
const Order = require("../models/order.model");
const bcrypt = require("bcryptjs");

/* ---------- helpers ---------- */
const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

const normalizePhone = (req) => {
  const p = String(req.body.phone || req.body.mobile || "").trim();
  if (!p) throw new Error("phone or mobile is required");
  req.body.phone = p;
  req.body.mobile = p;
  return p;
};

const ensureDocTypes = (docs = []) => {
  const ALLOWED = ["PAN", "AADHAAR", "UDYAM", "GST", "OTHER"];
  for (const d of docs) {
    if (d?.type && !ALLOWED.includes(d.type)) {
      throw new Error(`Invalid document type: ${d.type}`);
    }
  }
};

const makeSafeBuyer = (b) => {
  if (!b) return b;
  const obj = b.toObject ? b.toObject() : b;
  delete obj.passwordHash;
  return obj;
};

/* ---------- resolvers (via logged-in user) ---------- */

// Resolve Staff for the current user.
// Priority: req.user.staffId (from verifyJWT) → Staff.findOne({ userId: req.user._id })
async function getStaffForReq(req, { required = true } = {}) {
  if (!req.user?._id) {
    const err = new Error("Unauthorized: user missing");
    err.status = 401;
    throw err;
  }

  if (req.user.staffId) {
    const s = await Staff.findById(req.user.staffId);
    if (s) return s;
  }

  const s = await Staff.findOne({ userId: req.user._id });
  if (s) return s;

  if (required) {
    const err = new Error("Staff record not found for current user");
    err.status = 404;
    throw err;
  }
  return null;
}

// Resolve Buyer for the current user.
// Priority: req.user.buyerId → Buyer.findOne({ userId: req.user._id })
async function getBuyerForReq(req, { required = true } = {}) {
  if (!req.user?._id) {
    const err = new Error("Unauthorized: user missing");
    err.status = 401;
    throw err;
  }

  if (req.user.buyerId) {
    const b = await Buyer.findById(req.user.buyerId);
    if (b) return b;
  }

  const b = await Buyer.findOne({ userId: req.user._id });
  if (b) return b;

  if (required) {
    const err = new Error("Buyer record not found for current user");
    err.status = 404;
    throw err;
  }
  return null;
}

const isAdmin = (req) => ["admin", "superadmin"].includes(req.user?.role);
const isStaff = (req) => req.user?.role === "staff";

/* -------------------------------------------
   CREATE / REGISTER BUYER
   -> Staff derived from logged-in user (real code only)*/
exports.createBuyer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      // client-supplied employeeCode will be IGNORED for staff users
      // (admins or self-registering buyers MUST provide a valid one)
      employeeCode: employeeCodeFromBody,
      registeredBy,

      // legacy/ignored fields (kept for backward compat)
      staffId: staffIdFromBody,
      employee: employeeFromBody,

      name,
      email,
      gender,
      password,
      shopName,
      shopImage,
      shopAddress,
      documents,
      bank,
      isApproved,
    } = req.body;

    const phone = normalizePhone(req);
    ensureDocTypes(documents || []);

    if (
      !name ||
      !gender ||
      !shopName ||
      !shopAddress?.line1 ||
      !shopAddress?.city ||
      !shopAddress?.state ||
      !shopAddress?.postalCode
    ) {
      throw new Error("name, gender, shopName, shopAddress.line1/state/city/postalCode are required");
    }

    // -------- Resolve staff (REAL staff) --------
    let staffDoc = null;

    if (req.user?.role === "staff") {
      // Staff creating a buyer → always use THEIR OWN staff record (prevents spoofing)
      const myStaff = await Staff.findOne({ userId: req.user._id }).session(session);
      if (!myStaff) throw new Error("Staff record not found for current user");
      staffDoc = myStaff;
    } else if (req.user?.role === "admin" || req.user?.role === "superadmin") {
      // Admin path — allow explicit employeeCode OR staffId override
      if (employeeCodeFromBody) {
        staffDoc = await Staff.findOne({ employeeCode: String(employeeCodeFromBody).trim() }).session(session);
      } else if (staffIdFromBody || employeeFromBody) {
        const sid = staffIdFromBody || employeeFromBody;
        if (sid && mongoose.isValidObjectId(sid)) {
          staffDoc = await Staff.findById(sid).session(session);
        }
      }
      if (!staffDoc) throw new Error("Valid staff (employeeCode/staffId) required for admin-created buyer");
    } else {
      // Buyer or anonymous self-registration: must provide a valid employeeCode
      if (!employeeCodeFromBody) {
        throw new Error("employeeCode is required to link buyer to staff");
      }
      staffDoc = await Staff.findOne({ employeeCode: String(employeeCodeFromBody).trim() }).session(session);
      if (!staffDoc) throw new Error("Invalid employeeCode (staff not found)");
    }

    // At this point, staffDoc is guaranteed real & exists
    const realEmployeeCode = staffDoc.employeeCode;

    // -------- Ensure User with role='buyer' --------
    const emailNorm = email ? String(email).trim().toLowerCase() : undefined;

    let user = await User.findOne({
      $or: [{ phone }, ...(emailNorm ? [{ email: emailNorm }] : [])],
    }).session(session);

    if (!user) {
      const hash = password ? await bcrypt.genSalt(10).then((s) => bcrypt.hash(password, s)) : undefined;
      user = await User.create(
        [
          {
            name,
            phone,
            email: emailNorm,
            password: hash,
            role: "buyer",
            isApproved: true,
            isActive: true,
          },
        ],
        { session }
      ).then((a) => a[0]);
    } else {
      // Upgrade/normalize existing user
      if (user.role !== "buyer") user.role = "buyer";
      if (!user.phone) user.phone = phone;
      if (!user.email && emailNorm) user.email = emailNorm;
      if (!user.name) user.name = name;
      if (typeof user.isApproved === "undefined") user.isApproved = true;
      if (typeof user.isActive === "undefined") user.isActive = true;
      await user.save({ session });
    }

    // -------- Create Buyer (use REAL staff's employeeCode) --------
    const buyer = new Buyer({
      employeeCode: realEmployeeCode,
      registeredBy: registeredBy || staffDoc._id,
      staffId: staffDoc._id,
      employee: staffDoc._id, // legacy field
      name,
      phone,
      email: emailNorm,
      gender,
      shopName,
      shopImage,
      shopAddress,
      country: shopAddress?.country || "India",
      state: shopAddress?.state,
      city: shopAddress?.city,
      postalCode: shopAddress?.postalCode,
      documents,
      bank,
      isApproved: Boolean(isApproved) || false,
      dueAmount: 0,
      userId: user._id,
    });

    if (password) {
      await buyer.setPassword(password);
    }

    await buyer.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ ok: true, message: "Buyer created", buyer: makeSafeBuyer(buyer) });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err?.code === 11000) {
      const msg =
        (err.keyPattern?.phone && "Phone already exists") ||
        (err.keyPattern?.mobile && "Mobile already exists") ||
        (err.keyPattern?.email && "Email already exists") ||
        "Duplicate key";
      return res.status(409).json({ ok: false, message: "Buyer registration failed", error: msg });
    }

    return res.status(400).json({ ok: false, message: "Buyer registration failed", error: err.message });
  }
};

/* -------------------------------------------
   UPDATE BUYER
   - Staff cannot spoof other staff: employeeCode silently reset to their own
   - Admin can set employeeCode (validated)
--------------------------------------------*/
exports.updateBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    if (isStaff(req)) {
      // force staff-owned code
      const staffDoc = await getStaffForReq(req, { required: true });
      payload.staffId = staffDoc._id;
      payload.employeeCode = staffDoc.employeeCode;
    } else if (isAdmin(req)) {
      // admin may pass employeeCode, validate it
      if (payload.employeeCode) {
        const staffDoc = await Staff.findOne({ employeeCode: String(payload.employeeCode).trim() }).select("_id employeeCode");
        if (!staffDoc) return res.status(400).json({ message: "Invalid employeeCode" });
        payload.staffId = staffDoc._id;
        payload.employeeCode = staffDoc.employeeCode;
      }
    } else {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const buyer = await Buyer.findByIdAndUpdate(id, payload, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    return res.json({ ok: true, message: "Buyer updated", buyer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Buyer update failed", error: err.message });
  }
};

/* -------------------------------------------
   ASSIGN STAFF
   - Staff can only assign to themselves
   - Admin can assign to any valid employeeCode
--------------------------------------------*/
exports.assignStaff = async (req, res) => {
  try {
    const { id } = req.params;

    let staffDoc;
    if (isStaff(req)) {
      staffDoc = await getStaffForReq(req, { required: true });
    } else if (isAdmin(req)) {
      const { employeeCode } = req.body;
      if (!employeeCode) return res.status(400).json({ message: "employeeCode required" });
      staffDoc = await Staff.findOne({ employeeCode: String(employeeCode).trim() }).select("_id employeeCode name");
      if (!staffDoc) return res.status(400).json({ message: "Invalid employeeCode" });
    } else {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const buyer = await Buyer.findByIdAndUpdate(
      id,
      { staffId: staffDoc._id, employeeCode: staffDoc.employeeCode },
      { new: true }
    );
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    return res.json({
      ok: true,
      message: "Staff assigned to buyer",
      buyer,
      staff: { _id: staffDoc._id, employeeCode: staffDoc.employeeCode, name: staffDoc.name },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to assign staff", error: err.message });
  }
};

/* -------------------------------------------
   SET ADDRESS
--------------------------------------------*/
exports.setAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { line1, city, state, postalCode, country = "India" } = req.body;

    const buyer = await Buyer.findByIdAndUpdate(
      id,
      { shopAddress: { line1: line1 || "", city: city || "", state: state || "", postalCode: postalCode || "", country } },
      { new: true }
    );
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    return res.json({ ok: true, message: "Address saved", buyer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Address save failed", error: err.message });
  }
};

/* -------------------------------------------
   GET BUYER (by id)
--------------------------------------------*/
exports.getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id)
      .populate("staffId", "name employeeCode")
      .lean();
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    return res.json({ ok: true, buyer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch buyer", error: err.message });
  }
};

/* -------------------------------------------
   LIST BUYERS
   - Staff default: auto-filter to their own buyers unless overridden by admin
--------------------------------------------*/
exports.getAllBuyers = async (req, res) => {
  try {
    const { q, staffCode, staffId, page = 1, limit = 20, active, approved } = req.query;

    const pageNum = Math.max(1, toInt(page, 1));
    const limitNum = Math.max(1, toInt(limit, 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { shopName: rx }];
    }

    if (isStaff(req)) {
      // staff sees their own buyers by default
      const staffDoc = await getStaffForReq(req, { required: true });
      filter.employeeCode = staffDoc.employeeCode;
    } else if (isAdmin(req)) {
      // admins can filter by any staff
      if (staffCode) filter.employeeCode = staffCode;
      if (staffId && mongoose.isValidObjectId(staffId)) filter.staffId = staffId;
    }

    if (typeof active !== "undefined") filter.isActive = String(active) === "true";
    if (typeof approved !== "undefined") filter.isApproved = String(approved) === "true";

    const [items, total] = await Promise.all([
      Buyer.find(filter)
        .populate("staffId", "name employeeCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Buyer.countDocuments(filter),
    ]);

    return res.json({ ok: true, page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch buyers", error: err.message });
  }
};

/* -------------------------------------------
   DELETE BUYER
--------------------------------------------*/
exports.deleteBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    // (optional) Staff can only delete their own buyers — add guard if you want
    if (isStaff(req)) {
      const staffDoc = await getStaffForReq(req, { required: true });
      const b = await Buyer.findOne({ _id: id, staffId: staffDoc._id });
      if (!b) return res.status(403).json({ ok: false, message: "Forbidden: not your buyer" });
    }
    const buyer = await Buyer.findByIdAndDelete(id);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    return res.json({ ok: true, message: "Buyer deleted" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete buyer", error: err.message });
  }
};

/* -------------------------------------------
   BUYER ORDERS
--------------------------------------------*/
exports.getBuyerOrders = async (req, res) => {
  try {
    const buyerId = req.params.id;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (toInt(page, 1) - 1) * toInt(limit, 20);

    const q = { buyerId };
    if (status) q.status = status;

    // (optional guard) staff can only view their own buyer's orders
    if (isStaff(req)) {
      const staffDoc = await getStaffForReq(req, { required: true });
      const check = await Buyer.exists({ _id: buyerId, staffId: staffDoc._id });
      if (!check) return res.status(403).json({ ok: false, message: "Forbidden: not your buyer" });
    }

    const [items, total] = await Promise.all([
      Order.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(toInt(limit, 20))
        .select("status invoiceUrl totalAmount finalAmount createdAt brandBreakdown")
        .lean(),
      Order.countDocuments(q),
    ]);

    return res.json({ ok: true, page: toInt(page, 1), limit: toInt(limit, 20), total, items });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch buyer orders", error: err.message });
  }
};

exports.getBuyerOrderById = async (req, res) => {
  try {
    const { id: buyerId, orderId } = req.params;

    // (optional guard) staff can only view their own buyer's order
    if (isStaff(req)) {
      const staffDoc = await getStaffForReq(req, { required: true });
      const check = await Buyer.exists({ _id: buyerId, staffId: staffDoc._id });
      if (!check) return res.status(403).json({ ok: false, message: "Forbidden: not your buyer" });
    }

    const order = await Order.findOne({ _id: orderId, buyerId })
      .populate("products.product", "productname brand finalPrice")
      .populate("sellerId", "brandName")
      .populate("staffId", "name employeeCode");

    if (!order) return res.status(404).json({ message: "Order not found" });

    const steps = [
      { key: "confirmed", label: "Confirmed" },
      { key: "ready-to-dispatch", label: "Packed" },
      { key: "dispatched", label: "Dispatched" },
      { key: "delivered", label: "Delivered" },
    ];
    const currentIndex = steps.findIndex((s) => s.key === order.status);
    const timeline = steps.map((s, i) => ({ key: s.key, label: s.label, reached: currentIndex >= i }));

    return res.json({
      ok: true,
      order,
      tracking: { status: order.status, timeline, invoiceUrl: order.invoiceUrl || null },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch order", error: err.message });
  }
};

module.exports._helpers = { getStaffForReq, getBuyerForReq };
