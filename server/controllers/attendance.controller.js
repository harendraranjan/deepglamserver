const Attendance = require("../models/attendance.model");
const Staff = require("../models/staff.model");

// ✅ Mark Check-In
exports.markCheckIn = async (req, res) => {
  try {
    const { staffId } = req.body;
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    const existing = await Attendance.findOne({ staffId, date: today });
    if (existing) return res.status(400).json({ message: "Already checked in today" });

    const attendance = await Attendance.create({
      staffId,
      date: today,
      checkIn: new Date(),
    });

    res.status(201).json({ message: "Checked in", attendance });
  } catch (err) {
    res.status(500).json({ message: "Check-in failed", error: err.message });
  }
};

// ✅ Mark Check-Out
exports.markCheckOut = async (req, res) => {
  try {
    const { staffId } = req.body;
    const today = new Date().toISOString().split("T")[0];

    const attendance = await Attendance.findOne({ staffId, date: today });
    if (!attendance) return res.status(404).json({ message: "Not checked in yet" });

    attendance.checkOut = new Date();
    await attendance.save();

    res.json({ message: "Checked out", attendance });
  } catch (err) {
    res.status(500).json({ message: "Check-out failed", error: err.message });
  }
};

// 📅 Get attendance for staff (by month)
exports.getAttendanceByStaff = async (req, res) => {
  try {
    const { staffId, month } = req.params; // month: "2025-08"
    const regex = new RegExp(`^${month}`);

    const records = await Attendance.find({
      staffId,
      date: { $regex: regex },
    }).sort({ date: -1 });

    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch attendance", error: err.message });
  }
};
