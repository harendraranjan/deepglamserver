const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    country: { type: String, default: "India" },
    state: { type: String, required: true },
    city: { type: String, required: true },
    pincode: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Location", locationSchema);
