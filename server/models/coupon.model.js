const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: { type: Number, required: true }, // 10% or ₹100
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number },

    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },

    applicableTo: {
      type: String,
      enum: ["buyer", "seller", "all"],
      default: "buyer",
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
