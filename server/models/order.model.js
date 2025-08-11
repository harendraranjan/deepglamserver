const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
    address: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },

    pincode: { type: String, required: true },
    city: { type: String },
    state: { type:  String },
    country: { type: String, default: "India" },
    fullAddress: { type: String, required: true },
    staffCode: { type: String }, // to link employee

    products: [
      {
        
        quantity: { type: Number, default: 1 },
        price: { type: Number }, // per unit
        total: { type: Number }, // price * quantity
      },
    ],
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    brandBreakdown: [
      {
        brand: String,
        amount: Number,
      },
    ],

    totalAmount: { type: Number },
    discountAmount: { type: Number },
    gstAmount: { type: Number },
    finalAmount: { type: Number },

    status: {
      type: String,
      enum: ["confirmed", "dispatched", "delivered", "cancelled", "returned"],
      default: "confirmed",
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "partial"],
      default: "unpaid",
    },

    invoiceUrl: { type: String },
    sellerInvoiceUrl: { type: String },

    isReturnRequested: { type: Boolean, default: false },
    returnReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
