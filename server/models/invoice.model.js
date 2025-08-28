const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  hsnCode: String,
  qty: { type: Number, required: true, min: 1 },
  unitPricePaise: { type: Number, required: true, min: 0 },
  discountPaise: { type: Number, default: 0, min: 0 },
  gstPercentage: { type: Number, default: 0, min: 0 },
  gstPaise: { type: Number, default: 0, min: 0 },
  lineTotalPaise: { type: Number, required: true, min: 0 },
}, { _id: false });

const paymentRefSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  amountPaise: { type: Number, min: 0 },
  gateway: { type: String, enum: ["paytm","phonepe","razorpay","credit"] },
  at: { type: Date, default: Date.now },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  orderId:  { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", index: true },
  buyerId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  brand:    { type: String },

  number:   { type: String, unique: true, index: true },

  items: [invoiceItemSchema],

  subtotalPaise:     { type: Number, required: true, min: 0 },
  discountTotalPaise:{ type: Number, default: 0, min: 0 },
  gstTotalPaise:     { type: Number, default: 0, min: 0 },
  grandTotalPaise:   { type: Number, required: true, min: 0 },

  amountPaidPaise:   { type: Number, default: 0, min: 0 },
  balanceDuePaise:   { type: Number, default: 0, min: 0 },
  currency:          { type: String, default: "INR" },

  status: { type: String, enum: ["unpaid","partially_paid","paid","refunded"], default: "unpaid", index: true },
  paidAt: Date,
  refundedAt: Date,

  payments: [paymentRefSchema],

  hsnSummary: [{ hsnCode: String, taxablePaise: Number, gstPaise: Number }],

  paytm: {
    qrCodeId: String,
    qrData: String,
    qrImageB64: String,
  },
  phonepe: {
    merchantTransactionId: String,
    merchantOrderId: String,
  },

}, { timestamps: true, versionKey: false }); // ✅ fixed

invoiceSchema.methods.applyPayment = function(amountPaise, paymentId, gateway) {
  const amt = Number(amountPaise || 0);
  this.amountPaidPaise = (this.amountPaidPaise || 0) + amt;
  this.balanceDuePaise = Math.max((this.grandTotalPaise || 0) - (this.amountPaidPaise || 0), 0);
  if (this.amountPaidPaise === 0) this.status = "unpaid";
  else if (this.balanceDuePaise > 0) this.status = "partially_paid";
  else {
    this.status = "paid";
    this.paidAt = new Date();
  }
  this.payments.push({ paymentId, amountPaise: amt, gateway, at: new Date() });
};

module.exports = mongoose.model("Invoice", invoiceSchema);
