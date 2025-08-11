const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String },
    image: {
      url: { type: String },
      public_id: { type: String },
    },
    linkTo: {
      type: String,
      enum: ["category", "brand", "product"],
    },
    value: { type: String }, // categoryId, brandName, or productId
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
