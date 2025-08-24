const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* Subdocs same as before ... */

// ⛳️ CHANGES START
const buyerSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, required: true },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },

    name: { type: String, required: true },

    // ✅ Keep both fields so existing `mobile_1` unique index is satisfied
    phone:  { type: String, required: true },  // primary in app
    mobile: { type: String, index: true, unique: true, sparse: true }, // mirrors phone

    email: { type: String, trim: true, lowercase: true, index: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },

    passwordHash: { type: String },

    shopName: { type: String, required: true },
    shopImage: { url: String, public_id: String },
    shopAddress: {
      line1: { type: String, required: true },
      line2: { type: String },
      country: { type: String, default: "India" },
      state: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true }
    },

    country: { type: String, default: "India" },
    state: { type: String },
    city: { type: String },
    postalCode: { type: String },

    documents: [{
      type: {
        type: String,
        required: true,
        enum: ["PAN", "AADHAAR", "UDYAM", "GST", "OTHER"],
      },
      number: { type: String, required: true },
      file: { url: String, public_id: String }
    }],

    bank: {
      bankName: { type: String },
      branchName: { type: String },
      accountHolderName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      beneficiaryName: { type: String }
    },

    isApproved: { type: Boolean, default: false },
    dueAmount: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// 🔒 Always keep mobile in-sync so the existing mobile_1 index is happy
buyerSchema.pre("validate", function(next) {
  const p = this.phone || this.mobile;
  if (!p || !String(p).trim()) {
    return next(new Error("phone or mobile is required"));
  }
  this.phone = String(p).trim();
  this.mobile = String(p).trim();
  next();
});
// ⛳️ CHANGES END

/* Methods */
buyerSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

buyerSchema.methods.validatePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

/* Text index (remove old mobile text key) */
buyerSchema.index({
  shopName: "text",
  name: "text",
  email: "text",
  "shopAddress.line1": "text",
  city: "text",
  state: "text",
  postalCode: "text",
});

// NOTE: Don't add another unique index on phone to avoid double-conflict;
// existing unique mobile_1 index will enforce uniqueness effectively.

module.exports = mongoose.model("Buyer", buyerSchema);
