const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    employeeCode: { type: String, unique: true, required: true }, // e.g., EMP001
    phone: { type: String, required: true },
    email: { type: String },
    address: { type: String },
    photo: {
      url: { type: String },
      public_id: { type: String },
    },

    salary: { type: Number, default: 0 },
    travelAllowance: { type: Number, default: 0 },
    target: { type: Number, default: 0 }, // Monthly sales target

    bankDetails: {
      accountNumber: { type: String },
      ifscCode: { type: String },
      accountHolderName: { type: String },
    },

    isActive: { type: Boolean, default: true },
    fcmToken: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", staffSchema);
