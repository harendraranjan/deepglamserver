const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", index: true, required: true },
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
  buyerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

  gateway:   { type: String, enum: ["paytm","phonepe","razorpay","credit"], required: true },
  amountPaise: { type: Number, required: true, min: 0 },
  currency:  { type: String, default: "INR" },

  status: { type: String, enum: ["created","pending","captured","failed","refunded"], default: "created", index: true },

  // Gateway references
  pg_order_id:   String, // Paytm: orderId / QR id, PhonePe: instrument/order id (if applicable)
  pg_payment_id: String, // txn id from gateway

  // Security & idempotency
  idempotencyKey: { type: String, unique: true, sparse: true }, // e.g., TXNID or merchantTransactionId
  verifiedSignature: { type: Boolean, default: false },
  checksum: String, // Paytm checksum or PhonePe X-VERIFY proof (store for audit)

  // Fees & settlement (optional but recommended for scale)
  feePaise: { type: Number, default: 0, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  netPaise: { type: Number, default: 0, min: 0 }, // amount - fee - tax
  capturedAt: Date,
  settledAt: Date,
  settlementId: String,

  // Reconciliation & risk
  reconStatus: { type: String, enum: ["pending","matched","mismatch"], default: "pending" },
  riskScore: Number,
  flagReason: String,

  meta: {},

}, { timestamps: true });

paymentSchema.index({ gateway: 1, pg_order_id: 1 });
paymentSchema.index({ gateway: 1, pg_payment_id: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
