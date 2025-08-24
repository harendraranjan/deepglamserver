/*const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const Staff = require("../models/staff.model");
const Buyer = require("../models/buyer.model");

const sign = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

/**
 * POST /auth/login
 * Body: { phoneOrEmail: string, password: string }
 *//*
exports.loginUnified = async (req, res) => {
  try {
    const { phoneOrEmail, password } = req.body || {};
    if (!phoneOrEmail || !password) {
      return res.status(400).json({ ok: false, error: "phoneOrEmail and password are required" });
    }

    const isEmail = /\S+@\S+\.\S+/.test(phoneOrEmail);
    const phone = isEmail ? undefined : String(phoneOrEmail).trim();
    const email = isEmail ? String(phoneOrEmail).trim().toLowerCase() : undefined;

    // 1) Try USER first (covers: seller/admin/buyer/staff if you use User table)
    let user = await User.findOne({
      $or: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    });

    if (user) {
      const ok = await bcrypt.compare(password, user.password || "");
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const token = sign({ id: user._id, role: user.role || "user", model: "user" });
      return res.json({
        ok: true,
        token,
        role: user.role || "user",
        profile: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
        },
      });
    }

    // 2) Try STAFF (if some staff only exist in Staff collection)
    const staff = await Staff.findOne({
      $or: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    });
    if (staff) {
      // If Staff model stores hashed password (recommended)
      const ok = await bcrypt.compare(password, staff.password || "");
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const token = sign({ id: staff._id, role: "staff", model: "staff" });
      return res.json({
        ok: true,
        token,
        role: "staff",
        profile: {
          id: staff._id,
          name: staff.name,
          phone: staff.phone,
          email: staff.email,
          employeeCode: staff.employeeCode,
        },
      });
    }

    // 3) Try BUYER (if some buyers only exist in Buyer collection)
    const buyer = await Buyer.findOne({
      $or: [
        ...(phone ? [{ mobile: phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    });
    if (buyer) {
      // Prefer linked USER (recommended)
      if (buyer.userId) {
        const linkedUser = await User.findById(buyer.userId);
        if (!linkedUser) {
          // fallback to buyer.passwordHash if present
          if (!buyer.passwordHash) return res.status(401).json({ ok: false, error: "Invalid credentials" });
          const ok = await bcrypt.compare(password, buyer.passwordHash);
          if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

          const token = sign({ id: buyer._id, role: "buyer", model: "buyer" });
          return res.json({
            ok: true,
            token,
            role: "buyer",
            profile: {
              id: buyer._id,
              name: buyer.name,
              phone: buyer.mobile,
              email: buyer.email,
            },
          });
        } else {
          const ok = await bcrypt.compare(password, linkedUser.password || "");
          if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

          const token = sign({ id: linkedUser._id, role: "buyer", model: "user" });
          return res.json({
            ok: true,
            token,
            role: "buyer",
            profile: {
              id: linkedUser._id,
              name: linkedUser.name,
              phone: linkedUser.phone,
              email: linkedUser.email,
            },
          });
        }
      }

      // No userId linked — use buyer.passwordHash (if you store it)
      if (!buyer.passwordHash) return res.status(401).json({ ok: false, error: "Invalid credentials" });
      const ok = await bcrypt.compare(password, buyer.passwordHash);
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const token = sign({ id: buyer._id, role: "buyer", model: "buyer" });
      return res.json({
        ok: true,
        token,
        role: "buyer",
        profile: {
          id: buyer._id,
          name: buyer.name,
          phone: buyer.mobile,
          email: buyer.email,
        },
      });
    }

    // Not found anywhere
    return res.status(404).json({ ok: false, error: "Account not found" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Login failed" });
  }
};
*/

// controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const Staff = require("../models/staff.model");
const Buyer = require("../models/buyer.model");
const Seller = require("../models/seller.model"); // <-- add this

const sign = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

const isEmailLike = (v) => /\S+@\S+\.\S+/.test(String(v || "").trim());

/**
 * POST /auth/login
 * Body: { phoneOrEmail: string, password: string }
 */
exports.loginUnified = async (req, res) => {
  try {
    const { phoneOrEmail, password } = req.body || {};
    if (!phoneOrEmail || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "phoneOrEmail and password are required" });
    }

    const isEmail = isEmailLike(phoneOrEmail);
    const phone = isEmail ? undefined : String(phoneOrEmail).trim();
    const email = isEmail ? String(phoneOrEmail).trim().toLowerCase() : undefined;

    // 1) USER first (covers most cases: buyer/seller/staff/admin with User docs)
    let user = await User.findOne({
      $or: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    });

    if (user) {
      const ok = await bcrypt.compare(password, user.password || "");
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      // Optional gates
      if (user.isActive === false) {
        return res.status(403).json({ ok: false, error: "Account disabled" });
      }
      // If you want to gate seller by approval via User flag:
      if (user.role === "seller" && user.isApproved === false) {
        return res.status(403).json({ ok: false, error: "Seller pending approval" });
      }

      // attach role-specific ids if they exist
      let staffId = null, buyerId = null, sellerId = null, employeeCode = null;

      if (user.role === "staff") {
        const s = await Staff.findOne({ userId: user._id }).select("_id employeeCode");
        if (s) { staffId = s._id; employeeCode = s.employeeCode; }
      } else if (user.role === "buyer") {
        const b = await Buyer.findOne({ userId: user._id }).select("_id");
        if (b) buyerId = b._id;
      } else if (user.role === "seller") {
        const s = await Seller.findOne({ userId: user._id }).select("_id isActive");
        if (s) {
          sellerId = s._id;
          if (s.isActive === false) {
            return res.status(403).json({ ok: false, error: "Seller disabled" });
          }
        }
      }

      const token = sign({ id: user._id, role: user.role || "user", model: "user" });
      return res.json({
        ok: true,
        token,
        role: user.role || "user",
        profile: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          staffId, buyerId, sellerId, employeeCode,
        },
      });
    }

    // 2) STAFF fallback (staff existing only in Staff collection)
    const staff = await Staff.findOne({
      $or: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    }).populate("userId", "name phone email"); // if you want virtuals resolved

    if (staff) {
      // If Staff stores its own hashed password (password or passwordHash)
      const staffPass =
        staff.password || staff.passwordHash || staff.userId?.password || "";
      const ok = await bcrypt.compare(password, staffPass);
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      if (staff.isActive === false) {
        return res.status(403).json({ ok: false, error: "Staff disabled" });
      }

      const token = sign({ id: staff._id, role: "staff", model: "staff" });
      return res.json({
        ok: true,
        token,
        role: "staff",
        profile: {
          id: staff._id,
          name: staff.userId?.name || staff.name,
          phone: staff.userId?.phone,
          email: staff.userId?.email,
          employeeCode: staff.employeeCode,
        },
      });
    }

    // 3) BUYER fallback (buyer only in Buyer collection)
    const buyer = await Buyer.findOne({
      $or: [
        ...(phone ? [{ mobile: phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    });

    if (buyer) {
      if (buyer.userId) {
        const linkedUser = await User.findById(buyer.userId);
        const ok = await bcrypt.compare(password, (linkedUser?.password) || "");
        if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

        const token = sign({ id: linkedUser._id, role: "buyer", model: "user" });
        return res.json({
          ok: true,
          token,
          role: "buyer",
          profile: {
            id: linkedUser._id,
            name: linkedUser.name,
            phone: linkedUser.phone,
            email: linkedUser.email,
          },
        });
      }

      // Not linked to User → use buyer.passwordHash directly
      if (!buyer.passwordHash) {
        return res.status(401).json({ ok: false, error: "Invalid credentials" });
      }
      const ok = await bcrypt.compare(password, buyer.passwordHash);
      if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const token = sign({ id: buyer._id, role: "buyer", model: "buyer" });
      return res.json({
        ok: true,
        token,
        role: "buyer",
        profile: {
          id: buyer._id,
          name: buyer.name,
          phone: buyer.mobile,
          email: buyer.email,
        },
      });
    }

    // 4) SELLER fallback (for rare sellers that exist without a User doc)
    // This only works if your Seller schema stores contact & a hashed password.
    const seller = await Seller.findOne({
      $or: [
        ...(email ? [{ email }] : []), // only if Seller has 'email'
        ...(phone ? [{ phone }] : []), // only if Seller has 'phone'
      ],
    });

    if (seller) {
      // If linked to a user, we’d have matched in #1 already.
      if (!seller.userId) {
        if (!seller.passwordHash) {
          return res.status(404).json({ ok: false, error: "Account not found" });
        }
        const ok = await bcrypt.compare(password, seller.passwordHash);
        if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });
        if (seller.isActive === false) {
          return res.status(403).json({ ok: false, error: "Seller disabled" });
        }
        const token = sign({ id: seller._id, role: "seller", model: "seller" });
        return res.json({
          ok: true,
          token,
          role: "seller",
          profile: {
            id: seller._id,
            name: seller.brandName,
          },
        });
      }
    }

    // Not found anywhere
    return res.status(404).json({ ok: false, error: "Account not found" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Login failed" });
  }
};

