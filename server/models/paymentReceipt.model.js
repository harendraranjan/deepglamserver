const mongoose = require("mongoose");

const paymentReceiptSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    staffCode: { type: String },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["cash", "upi", "bank"], default: "cash" },
    reference: { type: String }, // txn id, UPI ref, cheque no etc
    note: { type: String },
    collectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PaymentReceipt ||
  mongoose.model("PaymentReceipt", paymentReceiptSchema);
