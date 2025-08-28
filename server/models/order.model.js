const mongoose = require("mongoose");

// store all money in PAISE (integers)
const int = v => (v == null ? v : Math.round(Number(v) || 0)); // force integers

const LineItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // optional for ad-hoc
  brand:    { type: String },
  quantity: { type: Number, set: int, default: 1 },
  price:    { type: Number, set: int },   // per-unit (PAISE, INT)
  total:    { type: Number, set: int },   // line total (PAISE, INT)
}, { _id: false });

const DispatchInfoSchema = new mongoose.Schema({
  courier: { type: String },
  awb:     { type: String },
  note:    { type: String },
  at:      { type: Date },
  by:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: false });

const LogSchema = new mongoose.Schema({
  at:     { type: Date, default: Date.now },
  by:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String }, // CONFIRMED / READY_TO_DISPATCH / DISPATCHED / DELIVERED / CANCELLED / RETURNED
  note:   { type: String },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  // Parties
  buyerId:   { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", required: true },
  sellerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Seller" }, // convenience (single-seller case)
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },  // buyer’s staff
  staffCode: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // Address snapshot
  pincode:     { type: String, required: true },
  city:        { type: String },
  state:       { type: String },
  country:     { type: String, default: "India" },
  fullAddress: { type: String, required: true },

  // Items
  products: [LineItemSchema],
  product:  { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // optional single-product shortcut

  // Brand-wise summary (numbers; store INT/paise via controller)
  brandBreakdown: [{ brand: String, amount: { type: Number, set: int } }],

  // Amounts (PAISE)
  totalAmount:    { type: Number, set: int }, // subtotal before discount/gst
  discountAmount: { type: Number, set: int },
  gstAmount:      { type: Number, set: int },
  finalAmount:    { type: Number, set: int }, // payable (== sum of related invoice grand totals)

  // Payments (order-level rollups; invoices are the source of truth)
  paidAmount:       { type: Number, set: int, default: 0 }, // legacy support (PAISE)
  amountPaidPaise:  { type: Number, set: int, default: 0 }, // use this going forward
  paymentStatus: {
    type: String,
    enum: ["unpaid", "partially_paid", "paid", "refunded"],
    default: "unpaid",
    index: true,
  },
  fullyPaidAt: { type: Date },

  // Status pipeline
  status: {
    type: String,
    enum: ["confirmed","ready-to-dispatch","dispatched","delivered","cancelled","returned"],
    default: "confirmed",
    index: true,
  },

  // Dispatch & audit
  dispatchInfo: DispatchInfoSchema,
  logs:         [LogSchema],

  // Invoices linkage (multi-seller/brand invoices)
  invoiceIds:        [{ type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }],
  orderNo:           { type: String },
  invoiceNo:         { type: String },        // (optional legacy single-invoice)
  invoiceUrl:        { type: String },
  sellerInvoiceUrl:  { type: String },

  // Operational controls
  riskHold: { type: Boolean, default: false }, // block dispatch until paid/high-value cleared

  // Returns
  isReturnRequested: { type: Boolean, default: false },
  returnReason:      { type: String },
}, { timestamps: true });

// Helpful indexes
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ staffId: 1, createdAt: -1 });
orderSchema.index({ staffCode: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// For seller-by-product queries
orderSchema.index({ "products.product": 1, status: 1, createdAt: -1 });

// ---------- helpers (optional, but nice) ----------

// Keep paymentStatus in sync easily from services/controllers
orderSchema.methods.setPaymentRollup = function ({ paidPaise }) {
  this.amountPaidPaise = int(paidPaise);
  this.paidAmount = int(paidPaise); // maintain legacy field
  const due = (this.finalAmount || 0) - (this.amountPaidPaise || 0);
  if (this.amountPaidPaise <= 0) {
    this.paymentStatus = "unpaid";
    this.fullyPaidAt = undefined;
  } else if (due > 0) {
    this.paymentStatus = "partially_paid";
    this.fullyPaidAt = undefined;
  } else {
    this.paymentStatus = "paid";
    if (!this.fullyPaidAt) this.fullyPaidAt = new Date();
  }
};

module.exports = mongoose.model("Order", orderSchema);
