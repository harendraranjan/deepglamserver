const Payroll = require("../models/payroll.model");
const Attendance = require("../models/attendance.model");
const Staff = require("../models/staff.model");

// 🧮 Generate payroll for staff (for a month)
exports.generatePayroll = async (req, res) => {
  try {
    const { staffId, month } = req.body; // e.g., "2025-08"

    const staff = await Staff.findById(staffId);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    const regex = new RegExp(`^${month}`);
    const records = await Attendance.find({ staffId, date: { $regex: regex } });

    const presentDays = records.filter(r => r.checkIn).length;
    const workingDays = 26; // Optional: make dynamic
    const absentDays = workingDays - presentDays;

    const baseSalary = staff.salary || 0;
    const travel = staff.travelAllowance || 0;
    const perDay = baseSalary / workingDays;
    const deduction = absentDays * perDay;
    const finalSalary = baseSalary + travel - deduction;

    const payroll = await Payroll.findOneAndUpdate(
      { staffId, month },
      {
        staffId,
        month,
        workingDays,
        presentDays,
        absentDays,
        baseSalary,
        travelAllowance: travel,
        deductions: deduction,
        finalSalary,
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Payroll generated", payroll });
  } catch (err) {
    res.status(500).json({ message: "Payroll generation failed", error: err.message });
  }
};

// 📄 Get payroll for staff (by month)
exports.getPayroll = async (req, res) => {
  try {
    const { staffId, month } = req.params;
    const payroll = await Payroll.findOne({ staffId, month });
    res.json(payroll);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

// 💰 Mark payroll paid
exports.markAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const payroll = await Payroll.findById(id);
    if (!payroll) return res.status(404).json({ message: "Payroll not found" });

    payroll.status = "paid";
    await payroll.save();

    res.json({ message: "Marked as paid" });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

// 📥 Get all payroll (admin)
exports.getAllPayroll = async (req, res) => {
  try {
    const all = await Payroll.find().populate("staffId").sort({ createdAt: -1 });
    res.json(all);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};
