const mongoose = require("mongoose");

const hsnSchema = new mongoose.Schema(
  {
    hsnCode: { type: String, required: true, unique: true },
    description: { type: String },
    gstPercentage: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HSN", hsnSchema);
