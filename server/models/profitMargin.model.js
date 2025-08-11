const mongoose = require("mongoose");

const profitMarginSchema = new mongoose.Schema(
  {
    category: { type: String }, // optional: subCategory or HSN can be used too
    marginPercentage: { type: Number }, // e.g., 25%
    applicableTo: {
      type: String,
      enum: ["buyer", "seller", "both"],
      default: "buyer",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProfitMargin", profitMarginSchema);
