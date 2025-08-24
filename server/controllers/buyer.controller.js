// server/controllers/buyer.controller.js
const mongoose = require("mongoose");
const Buyer = require("../models/buyer.model");
const User = require("../models/user.model");

const Staff = require("../models/staff.model");
const Order = require("../models/order.model");
const bcrypt = require("bcryptjs");

const normalizePhone = (req) => {
  const p = String(req.body.phone || req.body.mobile || "").trim();
  if (!p) throw new Error("phone or mobile is required");
  req.body.phone = p;
  req.body.mobile = p;            // keep in sync (existing mobile_1 unique index)
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

/** ─────────────────────────────────────────────────────────────
 * POST /api/buyers  → Create/Register Buyer
 * Body: { employeeCode, name, phone|mobile, email, gender, password, shopName, shopImage, shopAddress, documents[], bank }
 * Links staff by employeeCode (preferred) or uses passed staffId/employee
 * Also ensures a User with role='buyer'
 * ────────────────────────────────────────────────────────────*/
exports.createBuyer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1) Required & normalize
    const {
      employeeCode,        // required to link staff
      registeredBy,        // optional if employeeCode present
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
      isApproved,          // optional (default false)
    } = req.body;

    const phone = normalizePhone(req);
    ensureDocTypes(documents || []);

    if (!employeeCode) {
      throw new Error("employeeCode is required to link buyer to staff");
    }
    if (!name || !gender || !shopName || !shopAddress?.line1 || !shopAddress?.city || !shopAddress?.state || !shopAddress?.postalCode) {
      throw new Error("name, gender, shopName, shopAddress.line1/state/city/postalCode are required");
    }

    // 2) Resolve staff via employeeCode (preferred)
    let staffDoc = await Staff.findOne({ employeeCode }).session(session);
    if (!staffDoc && (staffIdFromBody || employeeFromBody)) {
      const sid = staffIdFromBody || employeeFromBody;
      staffDoc = await Staff.findById(sid).session(session);
    }
    if (!staffDoc) {
      throw new Error("Invalid employeeCode or staff not found");
    }

    // 3) Ensure a User with role='buyer'
    const emailNorm = email ? String(email).trim().toLowerCase() : undefined;
    let user = await User.findOne({ $or: [{ phone }, { email: emailNorm }] }).session(session);
    if (!user) {
      const hash = password ? await bcrypt.genSalt(10).then(s => bcrypt.hash(password, s)) : undefined;
      user = await User.create([{
        name, phone, email: emailNorm,
        password: hash,            // If your User stores password; else remove
        role: "buyer",             // IMPORTANT
        isApproved: true,          // allow login; your flow may vary
        isActive: true
      }], { session }).then(a => a[0]);
    } else {
      // upgrade/mutate to buyer if not already
      if (user.role !== "buyer") user.role = "buyer";
      if (!user.phone) user.phone = phone;
      if (!user.email && emailNorm) user.email = emailNorm;
      if (!user.name) user.name = name;
      if (typeof user.isApproved === "undefined") user.isApproved = true;
      if (typeof user.isActive === "undefined") user.isActive = true;
      await user.save({ session });
    }

    // 4) Create Buyer
    const buyer = new Buyer({
      employeeCode,
      registeredBy: registeredBy || staffDoc._id,
      staffId: staffDoc._id,
      employee: staffDoc._id,

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
      await buyer.setPassword(password); // hashes to passwordHash
    }

    await buyer.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({ ok: true, message: "Buyer created", buyer: makeSafeBuyer(buyer) });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    // Duplicate key friendly messages
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
   Update Buyer (profile/basic fields)
--------------------------------------------*/
exports.updateBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    // Optional: if employeeCode changed, re-verify & set staffId
    if (payload.employeeCode) {
      const staffDoc = await Staff.findOne({ employeeCode: payload.employeeCode }).select("_id employeeCode");
      if (!staffDoc) {
        return res.status(400).json({ message: "Invalid employeeCode" });
      }
      payload.staffId = staffDoc._id;
      payload.employeeCode = staffDoc.employeeCode;
    }

    const buyer = await Buyer.findByIdAndUpdate(id, payload, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    return res.json({ ok: true, message: "Buyer updated", buyer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Buyer update failed", error: err.message });
  }
};

/* -------------------------------------------
   Assign/Change Staff (admin or staff action)
--------------------------------------------*/
exports.assignStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeCode } = req.body;
    if (!employeeCode) return res.status(400).json({ message: "employeeCode required" });

    const staff = await Staff.findOne({ employeeCode }).select("_id employeeCode name");
    if (!staff) return res.status(400).json({ message: "Invalid employeeCode" });

    const buyer = await Buyer.findByIdAndUpdate(
      id,
      { staffId: staff._id, employeeCode: staff.employeeCode },
      { new: true }
    );

    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    return res.json({ ok: true, message: "Staff assigned to buyer", buyer, staff: { _id: staff._id, employeeCode: staff.employeeCode, name: staff.name } });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to assign staff", error: err.message });
  }
};

/* -------------------------------------------
   Set / Update Buyer Address
--------------------------------------------*/
exports.setAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { line1, city, state, postalCode, country = "India" } = req.body;

    const buyer = await Buyer.findByIdAndUpdate(
      id,
      {
        shopAddress: {
          line1: line1 || "",
          city: city || "",
          state: state || "",
          postalCode: postalCode || "",
          country,
        },
      },
      { new: true }
    );

    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    return res.json({ ok: true, message: "Address saved", buyer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Address save failed", error: err.message });
  }
};

/* -------------------------------------------
   Get Buyer by Id
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
   Get All Buyers (filters + pagination)
   Query: q?, staffCode?, staffId?, page=1, limit=20, active?, approved?
--------------------------------------------*/
exports.getAllBuyers = async (req, res) => {
  try {
    const { q, staffCode, staffId, page = 1, limit = 20, active, approved } = req.query;

    // safe int parser
    const safeParseInt = (val, fallback) => {
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? fallback : n;
    };
    const pageNum = Math.max(1, safeParseInt(page, 1));
    const limitNum = Math.max(1, safeParseInt(limit, 20));
    const skip = (pageNum - 1) * limitNum;

    // build filter
    const filter = {};
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { shopName: rx }];
    }
    if (staffCode) filter.employeeCode = staffCode;
    if (staffId && mongoose.isValidObjectId(staffId)) filter.staffId = staffId;
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

    return res.json({
      ok: true,
      page: pageNum,
      limit: limitNum,
      total,
      items,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, message: "Failed to fetch buyers", error: err.message });
  }
};


/* -------------------------------------------
   Delete Buyer
--------------------------------------------*/
exports.deleteBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const buyer = await Buyer.findByIdAndDelete(id);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    return res.json({ ok: true, message: "Buyer deleted" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to delete buyer", error: err.message });
  }
};

/* -------------------------------------------
   BUYER ORDERS (List & Track)
--------------------------------------------*/

/**
 * GET /buyers/:id/orders
 * Query: status?, page=1, limit=20
 */
exports.getBuyerOrders = async (req, res) => {
  try {
    const buyerId = req.params.id;
    const { status, page = 1, limit = 20 } = req.query;

    const q = { buyerId };
    if (status) q.status = status;

    const skip = (toInt(page, 1) - 1) * toInt(limit, 20);

    const [items, total] = await Promise.all([
      Order.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(toInt(limit, 20))
        .select("status invoiceUrl totalAmount finalAmount createdAt brandBreakdown")
        .lean(),
      Order.countDocuments(q),
    ]);

    return res.json({
      ok: true,
      page: toInt(page, 1),
      limit: toInt(limit, 20),
      total,
      items,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch buyer orders", error: err.message });
  }
};

/**
 * GET /buyers/:id/orders/:orderId
 * Returns order details + simple tracking timeline
 */
exports.getBuyerOrderById = async (req, res) => {
  try {
    const { id: buyerId, orderId } = req.params;

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

    const timeline = steps.map((s, i) => ({
      key: s.key,
      label: s.label,
      reached: currentIndex >= i,
    }));

    return res.json({
      ok: true,
      order,
      tracking: {
        status: order.status,
        timeline,
        invoiceUrl: order.invoiceUrl || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Failed to fetch order", error: err.message });
  }
};
