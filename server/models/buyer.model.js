const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const int = v => (v == null ? v : Math.round(Number(v) || 0)); // store money in paise

const buyerSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    staffId:      { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },

    name: { type: String, required: true },

    // ✅ Keep both; ensure uniqueness without breaking old data
    phone:  { type: String, required: true },                 // primary in app
    mobile: { type: String, index: true, unique: true, sparse: true }, // mirrors phone

    email:   { type: String, trim: true, lowercase: true, index: true },
    gender:  { type: String, enum: ["male", "female", "other"], required: true },

    passwordHash: { type: String },

    shopName: { type: String, required: true },
    shopImage: { url: String, public_id: String },
    shopAddress: {
      line1: { type: String, required: true },
      line2: { type: String },
      country: { type: String, default: "India" },
      state:   { type: String, required: true },
      city:    { type: String, required: true },
      postalCode: { type: String, required: true }
    },

    country:    { type: String, default: "India" },
    state:      { type: String },
    city:       { type: String },
    postalCode: { type: String },

    documents: [{
      type:   { type: String, required: true, enum: ["PAN", "AADHAAR", "UDYAM", "GST", "OTHER"] },
      number: { type: String, required: true },
      file:   { url: String, public_id: String }
    }],

    bank: {
      bankName:          { type: String },
      branchName:        { type: String },
      accountHolderName: { type: String },
      accountNumber:     { type: String },
      ifscCode:          { type: String },
      beneficiaryName:   { type: String }
    },

    // 🔐 Credit & dues (paise)
    dueAmountPaise:   { type: Number, set: int, default: 0 },  // source of truth (replace legacy dueAmount)
    allowCredit:      { type: Boolean, default: false },
    creditLimitPaise: { type: Number, set: int, default: 0 },
    riskTier:         { type: String, enum: ["low","medium","high"], default: "low" },

    // Legacy field kept for backward compatibility (mirror of dueAmountPaise in controllers)
    dueAmount: { type: Number, default: 0 }, // DEPRECATED: keep until all reads migrate

    // Account link
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Optional flags
    kycVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 🔒 Keep phone & mobile in sync to satisfy unique index on mobile
buyerSchema.pre("validate", function(next) {
  const p = this.phone || this.mobile;
  if (!p || !String(p).trim()) return next(new Error("phone or mobile is required"));
  this.phone = String(p).trim();
  this.mobile = String(p).trim();
  next();
});

// Password helpers
buyerSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};
buyerSchema.methods.validatePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

// Text search
buyerSchema.index({
  shopName: "text",
  name: "text",
  email: "text",
  "shopAddress.line1": "text",
  city: "text",
  state: "text",
  postalCode: "text",
});

// Fast filters
buyerSchema.index({ allowCredit: 1, riskTier: 1 });
buyerSchema.index({ dueAmountPaise: -1 });

module.exports = mongoose.model("Buyer", buyerSchema);
