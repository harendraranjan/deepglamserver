// server/utils/authResolvers.js
const mongoose = require("mongoose");
const Seller   = require("../models/seller.model");
const Staff    = require("../models/staff.model");
const Buyer    = require("../models/buyer.model");

/** Safely read the token user id (middleware may set id or _id) */
function getTokenUserId(req) {
  return req?.user?.id || req?.user?._id || null;
}

/** Validate a potential ObjectId string */
function isOid(id) {
  return !!id && mongoose.isValidObjectId(id);
}

/** Resolve sellerId: prefer req.user.sellerId, else DB by userId */
async function resolveSellerId(req) {
  if (isOid(req?.user?.sellerId)) return String(req.user.sellerId);

  const userId = getTokenUserId(req);
  if (!isOid(userId)) return null;

  const seller = await Seller.findOne({ userId }).select("_id");
  return seller ? String(seller._id) : null;
}

/** Resolve staffId: prefer req.user.staffId, else DB by userId */
async function resolveStaffId(req) {
  if (isOid(req?.user?.staffId)) return String(req.user.staffId);

  const userId = getTokenUserId(req);
  if (!isOid(userId)) return null;

  const staff = await Staff.findOne({ userId }).select("_id employeeCode");
  return staff ? String(staff._id) : null;
}

/** Resolve buyerId: prefer req.user.buyerId, else DB by userId */
async function resolveBuyerId(req) {
  if (isOid(req?.user?.buyerId)) return String(req.user.buyerId);

  const userId = getTokenUserId(req);
  if (!isOid(userId)) return null;

  const buyer = await Buyer.findOne({ userId }).select("_id");
  return buyer ? String(buyer._id) : null;
}

/** Optional: resolve full Staff document for current user */
async function resolveStaffDoc(req, projection = "_id employeeCode name userId") {
  const userId = getTokenUserId(req);
  if (!isOid(userId)) return null;

  // If middleware already gave us staffId, try that first
  if (isOid(req?.user?.staffId)) {
    const byId = await Staff.findById(req.user.staffId).select(projection);
    if (byId) return byId;
  }
  return Staff.findOne({ userId }).select(projection);
}

/** Resolve a unified object of ids (useful when a controller needs many) */
async function resolveEntities(req) {
  const [sellerId, staffId, buyerId] = await Promise.all([
    resolveSellerId(req),
    resolveStaffId(req),
    resolveBuyerId(req),
  ]);
  return { sellerId, staffId, buyerId };
}

/** Quick role guard for inside controllers (not middleware) */
function requireRole(req, roles = []) {
  const role = req?.user?.role;
  if (!role || !roles.includes(role)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

/** Assert that current user has a linked Seller row (and optionally approved) */
async function assertSellerLinked(req, { mustBeApproved = false } = {}) {
  const sellerId = await resolveSellerId(req);
  if (!sellerId) {
    const err = new Error("Seller not found for this user");
    err.status = 400;
    throw err;
  }
  if (mustBeApproved) {
    const seller = await Seller.findById(sellerId).select("_id isActive");
    if (!seller?.isActive) {
      const err = new Error("Seller is not approved/active");
      err.status = 403;
      throw err;
    }
  }
  return sellerId;
}

/** Assert that current user has a linked Staff row */
async function assertStaffLinked(req) {
  const staffId = await resolveStaffId(req);
  if (!staffId) {
    const err = new Error("Staff not found for this user");
    err.status = 400;
    throw err;
  }
  return staffId;
}

/** Assert that current user has a linked Buyer row */
async function assertBuyerLinked(req) {
  const buyerId = await resolveBuyerId(req);
  if (!buyerId) {
    const err = new Error("Buyer not found for this user");
    err.status = 400;
    throw err;
  }
  return buyerId;
}

module.exports = {
  getTokenUserId,
  resolveSellerId,
  resolveStaffId,
  resolveBuyerId,
  resolveStaffDoc,
  resolveEntities,
  requireRole,
  assertSellerLinked,
  assertStaffLinked,
  assertBuyerLinked,
};
