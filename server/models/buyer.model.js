// server/models/buyer.model.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* -------------------------
 * Subdocs
 * ------------------------- */

const imageSchema = new mongoose.Schema(
  {
    url: { type: String },
    public_id: { type: String },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true }, // shop address line
    line2: { type: String },
    country: { type: String, required: true, default: "India" },
    state: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true }, // a.k.a. pincode
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "PAN",
        "AADHAAR",
        "UDYAM",
        "GST",
        "OTHER",
      ],
    },
    number: { type: String, required: true },
    file: imageSchema, // uploaded image/pdf (Cloudinary/local)
  },
  { _id: false }
);

const bankSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true }, // dropdown in UI
    branchName: { type: String },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    beneficiaryName: { type: String }, // optional if different from holder
  },
  { _id: false }
);

/* -------------------------
 * Buyer Schema
 * ------------------------- */

const buyerSchema = new mongoose.Schema(
  {
    // Employee who registered this buyer
    employeeCode: { type: String, required: true }, // e.g. EMP001
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" }, // optional link to staff

    // Identity / login
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },

    // Password (hashed). Prefer storing in User model, but added here per your request.
    passwordHash: { type: String },

    // Shop
    shopName: { type: String, required: true },
    shopAddress: { type: addressSchema, required: true },
    shopImage: imageSchema,

    // Extra location fields (duplicated for quick filters/search)
    country: { type: String, required: true, default: "India" },
    state: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },

    // Documents (PAN, Aadhaar, Udyam, GST, etc.)
    documents: [documentSchema],

    // Bank details
    bank: bankSchema,

    // System flags
    isApproved: { type: Boolean, default: false },
    dueAmount: { type: Number, default: 0 }, // for payment tracking

    // Optional link to user if you keep users separate
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

/* -------------------------
 * Virtuals / Methods
 * ------------------------- */

// Set password safely
buyerSchema.methods.setPassword = async function setPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

// Validate password
buyerSchema.methods.validatePassword = async function validatePassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

/* -------------------------
 * Indexes
 * ------------------------- */

// Optional compound search index
buyerSchema.index({
  shopName: "text",
  name: "text",
  email: "text",
  mobile: "text",
  "shopAddress.line1": "text",
  city: "text",
  state: "text",
  postalCode: "text",
});

/* ------------------------- */

module.exports = mongoose.model("Buyer", buyerSchema);
