const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true,  },
    email: { type: String, required: true, lowercase: true },
    password: { type: String }, // Optional for OTP-only users
    role: {
      type: String,
      enum: ["buyer", "seller", "staff", "admin"],
      default: "buyer",
    },

    // ✅ Buyer-specific fields
    employeeCode: { type: String }, // Linked staff code
    gender: { type: String, enum: ["male", "female", "other"] },
    shopName: { type: String },
    shopPhoto: {
      url: { type: String },
      public_id: { type: String },
    },

    address: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },

    documentType: { type: String },
    documentNumber: { type: String },
    documentImage: {
      url: { type: String },
      public_id: { type: String },
    },

    // ✅ Seller-specific
    isSellerApproved: { type: Boolean, default: false },

    // ✅ Buyer/Admin common
    isApproved: { type: Boolean, default: false },
    isRejected: { type: Boolean, default: false },
    rejectReason: { type: String },

    // ✅ For OTP login
    fcmToken: { type: String },
    otpCode: { type: String },
    otpExpiresAt: { type: Date },

    // ✅ Financial (for buyer credit tracking)
    creditLimit: { type: Number, default: 0 },
    currentDue: { type: Number, default: 0 },

    // ✅ Badge for UI
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);