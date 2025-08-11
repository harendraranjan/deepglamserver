const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", required: true },
    month: { type: String, required: true }, // e.g. "2025-08"
    workingDays: { type: Number },
    presentDays: { type: Number },
    absentDays: { type: Number },

    baseSalary: { type: Number },
    travelAllowance: { type: Number },
    deductions: { type: Number, default: 0 },
    finalSalary: { type: Number },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payroll", payrollSchema);
