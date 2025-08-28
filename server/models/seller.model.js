const mongoose = require("mongoose");

const int = v => (v == null ? v : Math.round(Number(v) || 0)); // store money in paise

const sellerSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    brandName: { type: String, required: true },
    gstNumber: { type: String },

    // ✅ Compliance flags (don’t store raw docs beyond what you already do)
    kycVerified:  { type: Boolean, default: false }, // Aadhaar/PAN/GST verification result
    gstVerified:  { type: Boolean, default: false },

    aadhaarCard: {
      front: { url: String, public_id: String },
      back:  { url: String, public_id: String },
    },

    fullAddress: {
      line1:      { type: String, required: true },
      line2:      { type: String },
      postalCode: { type: String, required: true },
      city:       { type: String, required: true },
      state:      { type: String, required: true },
      country:    { type: String, default: "India" }
    },

    // 🧾 Finance (for payouts & reconciliation)
    receivablePaise:  { type: Number, set: int, default: 0 }, // sum of captured payments not yet paid to seller
    payoutHoldPaise:  { type: Number, set: int, default: 0 }, // kept aside for returns/claims
    autoPayout:       { type: Boolean, default: false },      // allow auto-settlement when enabled
    payoutAccountToken: { type: String }, // tokenized account id from your payout partner (don’t store raw)
    settlementMeta:     { type: Object }, // optional, store settlement preferences or PG merchant subId

    // (Optional) display-only masked bank info for admin UI (NOT used to pay)
    payoutBankMasked: {
      bankName:   String,
      accountLast4: String,
      ifsc:      String
    },

    // Moderation & lifecycle
    isApproved:  { type: Boolean, default: false },
    isRejected:  { type: Boolean, default: false },
    rejectReason:{ type: String },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Useful indexes
sellerSchema.index({ brandName: 1 }, { collation: { locale: "en", strength: 2 } });
sellerSchema.index({ "fullAddress.city": 1, isApproved: 1 });

module.exports = mongoose.model("Seller", sellerSchema);
