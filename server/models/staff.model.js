// server/models/staff.model.js
const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeCode: { type: String, unique: true, required: true },
  name:  { type: String, required: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  address: {
  line1: { type: String },
  line2: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  country: { type: String, default: "India" }
},
  photo: { url: String, public_id: String },
  salary: { type: Number, default: 0 },
  travelAllowance: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
  },
  isActive: { type: Boolean, default: true },
  fcmToken: String,
}, { timestamps: true });

module.exports = mongoose.models.Staff || mongoose.model("Staff", staffSchema);
