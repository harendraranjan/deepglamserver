const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    checkIn: { type: Date },
    checkOut: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
