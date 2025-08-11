/*const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    brandName: { type: String, required: true },
    gstNumber: { type: String, required: true },

    aadhaarCard: {
      front: {
        url: { type: String },
        public_id: { type: String },
      },
      back: {
        url: { type: String },
        public_id: { type: String },
      },
    },

  fullAddress: {
  line1: { type: String, required: true },
  line2: { type: String },
  postalCode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, default: "India" }
},


    address: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },

    isApproved: { type: Boolean, default: false },
    isRejected: { type: Boolean, default: false },
    rejectReason: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Seller", sellerSchema);
*/
// server/models/seller.model.js
const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    brandName: { type: String, required: true },
    gstNumber: { type: String, required: true },

    aadhaarCard: {
      front: {
        url: { type: String },
        public_id: { type: String },
      },
      back: {
        url: { type: String },
        public_id: { type: String },
      },
    },

    fullAddress: {
      line1: { type: String, required: true },
      line2: { type: String },
      postalCode: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, default: "India" }
    },

    address: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },

    isApproved: { type: Boolean, default: false },
    isRejected: { type: Boolean, default: false },
    rejectReason: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Seller", sellerSchema);
