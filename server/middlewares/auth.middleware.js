const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const resolveUserEntities = require("../utils/authResolvers");

exports.verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    // Check if authorization header exists and has correct format
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({
        ok: false,
        message: "Authorization header missing or invalid format",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token || token.trim() === "") {
      return res.status(401).json({
        ok: false,
        message: "Token missing",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ ok: false, message: "Token expired" });
      } else if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({ ok: false, message: "Invalid token" });
      }
      throw jwtError;
    }

    // Validate decoded token structure
    if (!decoded.id) {
      return res.status(401).json({ ok: false, message: "Invalid token payload" });
    }

    // Fetch user from database
    const user = await User.findById(decoded.id).select("_id role isApproved isActive");
    if (!user) {
      return res.status(401).json({ ok: false, message: "User not found" });
    }

    // Account state checks
    if (user.isActive === false) {
      return res.status(403).json({ ok: false, message: "Account deactivated" });
    }
    if (user.role === "seller" && user.isApproved === false) {
      return res.status(403).json({ ok: false, message: "Seller account pending approval" });
    }

    // Resolve linked entities (seller/buyer/staff)
    let userEntities = {};
    try {
      userEntities = await resolveUserEntities(user._id);
    } catch (resolveError) {
      console.error("Error resolving user entities:", resolveError.message);
      userEntities = { sellerId: null, buyerId: null, staffId: null, employeeCode: null };
    }

    // Inject user data into request
    const { sellerId = null, buyerId = null, staffId = null, employeeCode = null } = userEntities || {};
    req.user = {
      id: user._id,                 // keep "id"
      _id: user._id,                // ✅ add "_id" for controller compatibility
      role: user.role,
      isApproved: user.isApproved,
      isActive: user.isActive,
      sellerId: sellerId ? String(sellerId) : null,
      buyerId:  buyerId  ? String(buyerId)  : null,
      staffId:  staffId  ? String(staffId)  : null,
      employeeCode: employeeCode || null,
    };

    next();
  } catch (err) {
    console.error("JWT verification error:", {
      message: err.message,
      stack: err.stack,
      userId: req.user?.id || "unknown",
    });

    return res.status(401).json({ ok: false, message: "Authentication failed" });
  }
};

exports.requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Authentication required" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: "Insufficient permissions" });
    }
    next();
  };
};

exports.requireApprovedSeller = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Authentication required" });
  }
  if (req.user.role !== "seller") {
    return res.status(403).json({ ok: false, message: "Seller access required" });
  }
  if (!req.user.isApproved) {
    return res.status(403).json({ ok: false, message: "Seller approval required" });
  }
  next();
};
