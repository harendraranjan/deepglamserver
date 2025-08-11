const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    mainCategory: { type: String, required: true },// e.g. "Men"
    subCategory: { type: String, required: true }, // e.g. "Shirts"

    // 👕 Product Type: Formal, Casual, Traditional etc.
    productType: {
      type: String,
      enum: ['formal', 'casual', 'traditional', 'partywear', 'festive', 'ethnic', 'western'],
      required: true,
    },

    productname: { type: String, required: true },

    description: { type: String },
    /*gender: {
      type: String,
      enum: ['men', 'women', 'kids', 'unisex'],
    },
*/
    hsnCode: { type: String }, // for GST classification

    MOQ: { type: Number, required: true }, // Minimum Order Quantity

    purchasePrice: { type: Number, required: true },
    margin: { type: Number, default: 0 }, // in %
    mrp: { type: Number }, // Optional

    discountPercentage: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },

    gstPercentage: { type: Number, default: 0 }, // like 5%, 12%
    gstAmount: { type: Number, default: 0 },
    gstType: {
      type: String,
      enum: ['inclusive', 'exclusive'],
      default: 'exclusive',
    },

    finalPrice: { type: Number, default: 0 },

    sizes: [{ type: String }],
    colors: [{ type: String }],

    mainImage: {
      url: String,
      public_id: String,
    },
    images: [
      {
        url: String,
        public_id: String,
      },
    ],

    stock: { type: Number, default: 0 },
    brand: { type: String },

    status: {
      type: String,
      enum: ['disapproved', 'approved', 'rejected'],
      default: 'disapproved',
    },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', productSchema);
