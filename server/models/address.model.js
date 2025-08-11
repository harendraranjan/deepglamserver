const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["home", "shop", "office"], default: "shop" },
    contactPerson: { type: String },
    phone: { type: String },
   pincode: { type: String, required: true },
    city: { type: String },
    state: { type:  String },
    country: { type: String, default: "India" },
    fullAddress: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Address", addressSchema);
