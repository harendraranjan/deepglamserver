// controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User   = require("../models/user.model");
const Buyer  = require("../models/buyer.model");
const Staff  = require("../models/staff.model");
const Seller = require("../models/seller.model");

const { resolveEntities } = require("../utils/authResolvers");

// ---------- helpers ----------
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

const norm = (v) => (v == null ? undefined : String(v).trim());
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : undefined);

// ---------- REGISTER ----------
exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body || {};
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: "name, phone, email, password are required" });
    }

    const emailNorm = normEmail(email);
    const phoneNorm = norm(phone);

    const exist = await User.findOne({ $or: [{ phone: phoneNorm }, { email: emailNorm }] });
    if (exist) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone: phoneNorm,
      email: emailNorm,
      password: hashed,
      role: role || "buyer",
      isApproved: role === "seller" ? false : true,
    });

    return res.status(201).json({ message: "Registered successfully", user });
  } catch (err) {
    return res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

// ---------- LOGIN ----------
/*
exports.login = async (req, res) => {
  try {
    let { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, message: "Identifier (email/phone) and password are required" });
    }

    identifier = String(identifier).trim();
    const isEmail = identifier.includes("@");
    const query = isEmail ? { email: identifier.toLowerCase() } : { phone: identifier };

    const user = await User.findOne(query);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) return res.status(401).json({ ok: false, message: "Invalid credentials" });

    // Pre-resolve ids for all roles (keeps behavior consistent)
    let { sellerId, buyerId, staffId } = await resolveEntities({ user: { id: user._id } });

    // Role-specific enrichments
    if (user.role === "buyer") {
      const buyer = await Buyer.findOne({ userId: user._id }).populate("staffId");
      if (!buyer) return res.status(404).json({ ok: false, message: "Buyer not found" });

      buyerId = buyer._id;
      staffId = buyer.staffId?._id || null;

      const token = signToken({ id: user._id, role: "buyer", buyerId, staffId });

      return res.json({
        ok: true,
        token,
        role: "buyer",
        buyer: {
          _id: buyer._id,
          name: buyer.name,
          phone: buyer.phone,
          email: buyer.email,
          gender: buyer.gender,
          shopName: buyer.shopName,
          shopAddress: buyer.shopAddress,
          staff: buyer.staffId
            ? {
                _id: buyer.staffId._id,
                name: buyer.staffId.name,
                employeeCode: buyer.staffId.employeeCode,
                email: buyer.staffId.email,
                phone: buyer.staffId.phone,
              }
            : null,
        },
      });
    }

    if (user.role === "seller") {
      // Optional enforcement: require linked seller + approval
      // Toggle this behavior via env if you like:
      const MUST_BE_APPROVED = process.env.SELLER_LOGIN_REQUIRES_APPROVAL === "true";

      const seller = await Seller.findOne({ userId: user._id }).select("_id isActive");
      if (!seller) {
        return res.status(404).json({ ok: false, message: "Seller record not found for this user" });
      }
      sellerId = seller._id;

      if (MUST_BE_APPROVED && !seller.isActive) {
        return res.status(403).json({ ok: false, message: "Seller not approved yet" });
      }
    }

    if (user.role === "staff") {
      const staff = await Staff.findOne({ userId: user._id }).select("_id employeeCode");
      if (staff) staffId = staff._id;
    }

    // Unified token & response for non-buyer roles (or generic case)
    const token = signToken({ id: user._id, role: user.role, sellerId, buyerId, staffId });

    res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isApproved: user.isApproved,
        sellerId,
        buyerId,
        staffId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ ok: false, message: "Login failed", error: err.message });
  }
};
*/
// ---------- LOGIN ----------
exports.login = async (req, res) => {
  try {
    let { email, mobile, phone, password } = req.body || {};

    if (!password) {
      return res.status(400).json({ ok: false, message: "Password is required" });
    }

    // prefer email if present, otherwise mobile/phone
    email  = (email  || "").trim();
    mobile = (mobile || phone || "").trim();

    if (!email && !mobile) {
      return res.status(400).json({ ok: false, message: "Provide either email or mobile" });
    }

    // build query
    const isEmail = !!email;
    const query   = isEmail
      ? { email: email.toLowerCase() }
      : { phone: mobile };

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    // Pre-resolve ids (sellerId/buyerId/staffId)
    let { sellerId, buyerId, staffId } = await resolveEntities({ user: { id: user._id } });

    // Role-specific enrichments
    if (user.role === "buyer") {
      const buyer = await Buyer.findOne({ userId: user._id }).populate("staffId");
      if (!buyer) return res.status(404).json({ ok: false, message: "Buyer not found" });

      buyerId = buyer._id;
      staffId = buyer.staffId?._id || null;

      const token = signToken({ id: user._id, role: "buyer", buyerId, staffId });

      return res.json({
        ok: true,
        token,
        role: "buyer",
        buyer: {
          _id: buyer._id,
          name: buyer.name,
          phone: buyer.phone,
          email: buyer.email,
          gender: buyer.gender,
          shopName: buyer.shopName,
          shopAddress: buyer.shopAddress,
          staff: buyer.staffId
            ? {
                _id: buyer.staffId._id,
                name: buyer.staffId.name,
                employeeCode: buyer.staffId.employeeCode,
                email: buyer.staffId.email,
                phone: buyer.staffId.phone,
              }
            : null,
        },
      });
    }

    if (user.role === "seller") {
      const MUST_BE_APPROVED = process.env.SELLER_LOGIN_REQUIRES_APPROVAL === "true";
      const seller = await Seller.findOne({ userId: user._id }).select("_id isActive");
      if (!seller) {
        return res.status(404).json({ ok: false, message: "Seller record not found for this user" });
      }
      sellerId = seller._id;
      if (MUST_BE_APPROVED && !seller.isActive) {
        return res.status(403).json({ ok: false, message: "Seller not approved yet" });
      }
    }

    if (user.role === "staff") {
      const staff = await Staff.findOne({ userId: user._id }).select("_id employeeCode");
      if (staff) staffId = staff._id;
    }

    const token = signToken({ id: user._id, role: user.role, sellerId, buyerId, staffId });

    return res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isApproved: user.isApproved,
        sellerId,
        buyerId,
        staffId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, message: "Login failed", error: err.message });
  }
};

// ---------- OTP STUBS ----------
exports.sendOtp = async (_req, res) => res.status(501).json({ message: "sendOtp not implemented" });
exports.otpLogin = async (_req, res) => res.status(501).json({ message: "otpLogin not implemented" });
exports.resetPassword = async (_req, res) => res.status(501).json({ message: "resetPassword not implemented" });

// ---------- Admin View ----------
exports.getAllUsersAdmin = async (_req, res) => {
  try {
    const users = await User.find({}, "name phone email role employeeCode isApproved isRejected rejectReason createdAt updatedAt")
      .populate("address");
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch users", error: err.message });
  }
};
