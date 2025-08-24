// controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User   = require("../models/user.model");
const Buyer  = require("../models/buyer.model");
const Staff  = require("../models/staff.model");
const Seller = require("../models/seller.model"); // make sure path/name is correct

// ---------- helpers ----------
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

const norm = (v) => (v == null ? undefined : String(v).trim());
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : undefined);
const autogenEmail = (phoneOrSeed) =>
  `${String(phoneOrSeed || Date.now())}@autogen.local`;

// Only seller needs approval in your flow; staff/buyer don't.
const sellerAccessChecks = async (userDoc, sellerDoc) => {
  // If you set seller approval on User or Seller, check both safely:
  if (userDoc && userDoc.role === "seller" && userDoc.isApproved === false) {
    return { ok: false, code: 403, msg: "Seller account pending approval" };
  }
  if (sellerDoc && sellerDoc.isActive === false) {
    return { ok: false, code: 403, msg: "Seller disabled" };
  }
  return { ok: true };
};

// ---------- register (as-is, minor hardening) ----------
exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body || {};
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: "name, phone, email, password are required" });
    }

    const emailNorm = normEmail(email);
    const phoneNorm = norm(phone);

    const exist = await User.findOne({
      $or: [{ phone: phoneNorm }, { email: emailNorm }],
    });
    if (exist) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      phone: phoneNorm,
      email: emailNorm,
      password: hashed,
      role: role || "buyer",
      isApproved: role === "seller" ? false : true, // optional
    });

    return res.status(201).json({ message: "Registered successfully", user });
  } catch (err) {
    return res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

// ---------- helpers (put above the controller or in a utils file) ----------




// safe password getter: supports both passwordHash or password fields
function getHashedPassword(obj) {
  // prefer passwordHash if present; else fallback to password
  return obj?.passwordHash || obj?.password || "";
}

// ---------- LOGIN ----------
exports.login = async (req, res) => {
  try {
    // Accept any of: {identifier,password} OR {email,password} OR {phone,password} OR {mobile,password}
    let { identifier, email, phone, mobile, password } = req.body || {};

    identifier = norm(identifier);
    // email if looks like email else undefined
    email = normEmail(email || (identifier && /\S+@\S+\.\S+/.test(identifier) ? identifier : undefined));
    // normalize phone/mobile (10–13 digits typical; tweak as needed)
    const idLooksLikePhone = identifier && !/\S+@\S+\.\S+/.test(identifier) ? identifier : undefined;
    phone = norm(phone || mobile || idLooksLikePhone);

    if ((!email && !phone) || !password) {
      return res.status(400).json({ ok: false, message: "email or phone, and password are required" });
    }

    // 1) Try USER first
    //    NOTE: many codebases use 'mobile' in User; yours seems to use 'phone'.
    //    So query both 'phone' and 'mobile' to be safe.
    let user = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone: phone }] : []),
        ...(phone ? [{ mobile: phone }] : []),
      ],
    })
      // if your schema sets select:false on password/passwordHash, ensure we include it:
      .select("+password +passwordHash +isApproved +role +email +phone +mobile");

    if (user) {
      const hashed = getHashedPassword(user);
      const passOK = await bcrypt.compare(String(password), String(hashed));
      if (!passOK) return res.status(401).json({ ok: false, message: "Invalid credentials" });

      // Optional seller approval/active checks
      let sellerDoc = null;
      if (user.role === "seller") {
        sellerDoc = await Seller.findOne({ userId: user._id }).select("_id isActive");
        const guard = await sellerAccessChecks(user, sellerDoc);
        if (!guard.ok) return res.status(guard.code).json({ ok: false, message: guard.msg });
      }

      // hydrate role-linked ids
      let staffId = null, buyerId = null, sellerId = null, employeeCode = null;

      if (user.role === "staff") {
        const s = await Staff.findOne({ userId: user._id }).select("_id employeeCode");
        if (s) { staffId = s._id; employeeCode = s.employeeCode; }
      } else if (user.role === "buyer") {
        const b = await Buyer.findOne({ userId: user._id }).select("_id");
        if (b) buyerId = b._id;
      } else if (user.role === "seller") {
        if (!sellerDoc) sellerDoc = await Seller.findOne({ userId: user._id }).select("_id isActive");
        if (sellerDoc) sellerId = sellerDoc._id;
      }

      const token = signToken({ id: user._id, role: user.role || "user" });
      return res.json({
        ok: true,
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || user.mobile, // support both
          role: user.role,
          isApproved: user.isApproved,
          employeeCode,
          staffId, buyerId, sellerId
        }
      });
    }

    // 2) STAFF fallback (legacy rows without User)
    let staff = await Staff.findOne({
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    });

    if (!staff && phone) {
      staff = await Staff.findOne({ employeeCode: phone }); // optional
    }

    if (staff) {
      const emailToUse = staff.email || (phone ? autogenEmail(phone) : autogenEmail(Date.now()));
      // NOTE: we should NOT override to the provided password if staff had its own hash;
      // but since it's a legacy row, we bootstrap with the provided password.
      const hashed = await bcrypt.hash(String(password), 10);

      const createdUser = await User.create({
        name: staff.name || "Staff",
        phone: staff.phone || phone,
        email: emailToUse,
        passwordHash: hashed, // prefer passwordHash going forward
        role: "staff",
        isApproved: true,
      });

      const token = signToken({ id: createdUser._id, role: "staff" });
      return res.json({
        ok: true,
        token,
        user: {
          _id: createdUser._id,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone,
          role: "staff",
          employeeCode: staff.employeeCode,
          staffId: staff._id,
          buyerId: null,
          sellerId: null
        }
      });
    }

    // 3) BUYER fallback (legacy buyers without User)
    let buyer = await Buyer.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ mobile: phone }] : []),
      ],
    }).select("+passwordHash +email +mobile +userId +name");

    if (buyer) {
      // If linked user exists, try that
      if (buyer.userId) {
        const linkedUser = await User.findById(buyer.userId).select("+password +passwordHash +email +phone +mobile");
        if (linkedUser) {
          const okPwd = await bcrypt.compare(String(password), String(getHashedPassword(linkedUser)));
          if (!okPwd) return res.status(401).json({ ok: false, message: "Invalid credentials" });
          const token = signToken({ id: linkedUser._id, role: "buyer" });
          return res.json({
            ok: true,
            token,
            user: {
              _id: linkedUser._id, name: linkedUser.name, email: linkedUser.email,
              phone: linkedUser.phone || linkedUser.mobile, role: "buyer", buyerId: buyer._id
            }
          });
        }
      }

      // If Buyer has its own passwordHash, accept it
      if (buyer.passwordHash) {
        const okPwd = await bcrypt.compare(String(password), String(buyer.passwordHash));
        if (!okPwd) return res.status(401).json({ ok: false, message: "Invalid credentials" });
        const token = signToken({ id: buyer._id, role: "buyer" });
        return res.json({
          ok: true,
          token,
          user: {
            _id: buyer._id, name: buyer.name, email: buyer.email, phone: buyer.mobile,
            role: "buyer", buyerId: buyer._id
          }
        });
      }

      // Otherwise create a User now (bootstrap)
      const createdUser = await User.create({
        name: buyer.name || "Buyer",
        phone: buyer.mobile || phone,
        email: buyer.email || (phone ? autogenEmail(phone) : autogenEmail(Date.now())),
        passwordHash: await bcrypt.hash(String(password), 10),
        role: "buyer",
        isApproved: true,
      });
      try { buyer.userId = createdUser._id; await buyer.save(); } catch (_) {}

      const token = signToken({ id: createdUser._id, role: "buyer" });
      return res.json({
        ok: true,
        token,
        user: {
          _id: createdUser._id, name: createdUser.name, email: createdUser.email,
          phone: createdUser.phone, role: "buyer", buyerId: buyer._id
        }
      });
    }

    // 4) (Optional) SELLER legacy path can be added here similarly if needed.

    return res.status(404).json({ ok: false, message: "Account not found" });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ ok: false, message: "Login failed", error: err.message });
  }
};


/*
// ---------- LOGIN ----------
exports.login = async (req, res) => {
  try {
    // Accept any of: {identifier, password} OR {email, password} OR {phone, password}
    let { identifier, email, phone, password } = req.body || {};

    identifier = norm(identifier);
    email = normEmail(email || (identifier && /\S+@\S+\.\S+/.test(identifier) ? identifier : undefined));
    phone = norm(phone || (identifier && !/\S+@\S+\.\S+/.test(identifier) ? identifier : undefined));

    if ((!email && !phone) || !password) {
      return res.status(400).json({ ok: false, message: "email or phone, and password are required" });
    }

    // 1) Try USER first (covers staff/buyer/seller/admin normally)
    let user = await User.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    });

    if (user) {
      const passOK = await bcrypt.compare(password, user.password || "");
      if (!passOK) return res.status(401).json({ ok: false, message: "Invalid credentials" });

      // Optional seller approval/active checks
      let sellerDoc = null;
      if (user.role === "seller") {
        sellerDoc = await Seller.findOne({ userId: user._id }).select("_id isActive");
        const guard = await sellerAccessChecks(user, sellerDoc);
        if (!guard.ok) return res.status(guard.code).json({ ok: false, message: guard.msg });
      }

      // hydrate role-linked ids
      let staffId = null, buyerId = null, sellerId = null, employeeCode = null;

      if (user.role === "staff") {
        const s = await Staff.findOne({ userId: user._id }).select("_id employeeCode");
        if (s) { staffId = s._id; employeeCode = s.employeeCode; }
      } else if (user.role === "buyer") {
        const b = await Buyer.findOne({ userId: user._id }).select("_id");
        if (b) buyerId = b._id;
      } else if (user.role === "seller") {
        if (!sellerDoc) sellerDoc = await Seller.findOne({ userId: user._id }).select("_id isActive");
        if (sellerDoc) sellerId = sellerDoc._id;
      }

      const token = signToken({ id: user._id, role: user.role || "user" });
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
          employeeCode,
          staffId, buyerId, sellerId
        }
      });
    }

    // 2) STAFF fallback (old data where no User document exists)
    //    Your latest Staff schema requires userId, so this will only hit for old rows.
    let staff = await Staff.findOne({
      // NOTE: old staff documents may have phone/email on Staff itself
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    });

    if (!staff && phone) {
      // Another strategy: an old staff might be linked by employeeCode in User.employeeCode—rare
      staff = await Staff.findOne({ employeeCode: phone }); // optional last-ditch
    }

    if (staff) {
      // create a User on the fly and log in
      const emailToUse = staff.email || (phone ? autogenEmail(phone) : autogenEmail(Date.now()));
      const hashed = await bcrypt.hash(password, 10);

      const createdUser = await User.create({
        name: staff.name || "Staff",
        phone: staff.phone || phone,
        email: emailToUse,
        password: hashed,
        role: "staff",
        isApproved: true,
      });

      const token = signToken({ id: createdUser._id, role: "staff" });
      return res.json({
        ok: true,
        token,
        user: {
          _id: createdUser._id,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone,
          role: "staff",
          employeeCode: staff.employeeCode,
          staffId: staff._id,
          buyerId: null,
          sellerId: null
        }
      });
    }

    // 3) BUYER fallback (old buyers without User)
    let buyer = await Buyer.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ mobile: phone }] : []),
      ],
    });

    if (buyer) {
      // If linked user exists but wasn't found earlier (stale), try it:
      if (buyer.userId) {
        const linkedUser = await User.findById(buyer.userId);
        if (linkedUser) {
          const okPwd = await bcrypt.compare(password, linkedUser.password || "");
          if (!okPwd) return res.status(401).json({ ok: false, message: "Invalid credentials" });
          const token = signToken({ id: linkedUser._id, role: "buyer" });
          return res.json({
            ok: true,
            token,
            user: {
              _id: linkedUser._id, name: linkedUser.name, email: linkedUser.email, phone: linkedUser.phone,
              role: "buyer", buyerId: buyer._id
            }
          });
        }
      }

      // If Buyer has its own passwordHash, accept it
      if (buyer.passwordHash) {
        const okPwd = await bcrypt.compare(password, buyer.passwordHash);
        if (!okPwd) return res.status(401).json({ ok: false, message: "Invalid credentials" });
        const token = signToken({ id: buyer._id, role: "buyer" });
        return res.json({
          ok: true,
          token,
          user: {
            _id: buyer._id, name: buyer.name, email: buyer.email, phone: buyer.mobile,
            role: "buyer", buyerId: buyer._id
          }
        });
      }

      // Otherwise create a User now
      const createdUser = await User.create({
        name: buyer.name || "Buyer",
        phone: buyer.mobile || phone,
        email: buyer.email || (phone ? autogenEmail(phone) : autogenEmail(Date.now())),
        password: await bcrypt.hash(password, 10),
        role: "buyer",
        isApproved: true,
      });
      try { buyer.userId = createdUser._id; await buyer.save(); } catch (_) {}

      const token = signToken({ id: createdUser._id, role: "buyer" });
      return res.json({
        ok: true,
        token,
        user: {
          _id: createdUser._id, name: createdUser.name, email: createdUser.email, phone: createdUser.phone,
          role: "buyer", buyerId: buyer._id
        }
      });
    }

    // 4) SELLER fallback (if you keep sellers without User; optional)
    // If your Seller schema stores contact + passwordHash, add similar flow here.
    // By default, we avoid authenticating sellers without a linked User safely.

    return res.status(404).json({ ok: false, message: "Account not found" });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ ok: false, message: "Login failed", error: err.message });
  }
};
*/
// ---------- OTP stubs with guards (so they don't crash) ----------
exports.sendOtp = async (req, res) => {
  try {
    // Prevent crashes if Otp model / email sender isn't wired yet
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "email is required" });
    // TODO: implement real Otp model + mailer
    return res.status(501).json({ message: "sendOtp not implemented" });
  } catch (e) {
    return res.status(500).json({ message: "OTP send error", error: e.message });
  }
};


// ✅ Get all users (Admin View)
exports.getAllUsersAdmin = async (req, res) => {
  try {
    const users = await User.find({}, 
      "name phone email role employeeCode shopName isApproved isRejected rejectReason isVerified createdAt updatedAt"
    ).populate("address"); 

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: err.message,
    });
  }
};


exports.otpLogin = async (_req, res) => {
  return res.status(501).json({ message: "otpLogin not implemented" });
};

exports.resetPassword = async (_req, res) => {
  return res.status(501).json({ message: "resetPassword not implemented" });
};
