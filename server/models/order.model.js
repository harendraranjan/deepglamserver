const mongoose = require("mongoose");

const int = v => (v == null ? v : Math.round(Number(v) || 0)); // force integers

const LineItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // optional for ad-hoc
  brand:    { type: String },
  quantity: { type: Number, set: int, default: 1 },
  price:    { type: Number, set: int },   // per-unit (INT)
  total:    { type: Number, set: int },   // line total (INT)
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

  // Brand-wise summary (numbers; we store ints via controller)
  brandBreakdown: [{ brand: String, amount: Number }],

  // Amounts (INT)
  totalAmount:    { type: Number, set: int },
  discountAmount: { type: Number, set: int },
  gstAmount:      { type: Number, set: int },
  finalAmount:    { type: Number, set: int },

  // Payments
  paidAmount:   { type: Number, set: int, default: 0 },
  paymentStatus:{
    type: String,
    enum: ["paid", "unpaid", "partial"],
    default: "unpaid",
  },

  // Status pipeline
  status: {
    type: String,
    enum: ["confirmed","ready-to-dispatch","dispatched","delivered","cancelled","returned"],
    default: "confirmed",
  },

  // Dispatch & audit
  dispatchInfo: DispatchInfoSchema,
  logs:         [LogSchema],

  // Invoices
  orderNo:          { type: String },
  invoiceNo:        { type: String },
  invoiceUrl:       { type: String },
  sellerInvoiceUrl: { type: String },

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

module.exports = mongoose.model("Order", orderSchema);
