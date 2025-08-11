const Staff = require("../models/staff.model");
const User = require("../models/user.model");

/*// 🔸 Create Staff (by Admin)
exports.createStaff = async (req, res) => {
  try {
    const { name, employeeCode, phone, email, salary, travelAllowance, target, address } = req.body;

    const existing = await Staff.findOne({ employeeCode });
    if (existing) return res.status(400).json({ message: "Employee code already exists" });

    const staff = await Staff.create({
      name,
      employeeCode,
      phone,
      email,
      salary,
      travelAllowance,
      target,
      address,
    });

    res.status(201).json({ message: "Staff created", staff });
  } catch (err) {
    res.status(500).json({ message: "Failed to create staff", error: err.message });
  }
};*/




// Helper function to generate employee code
const generateEmployeeCode = () => {
  // Example: EMP + current timestamp in milliseconds
  return 'EMP' + Date.now();
};

exports.createStaff = async (req, res) => {
  try {
    const { name, phone, email, salary, travelAllowance, target, address } = req.body;

    let employeeCode = generateEmployeeCode();

    // Make sure the generated employeeCode is unique (very unlikely to clash)
    const existing = await Staff.findOne({ employeeCode });
    if (existing) {
      // If somehow exists, generate a new one (rare case)
      employeeCode = generateEmployeeCode();
    }

    const staff = await Staff.create({
      name,
      employeeCode,
      phone,
      email,
      salary,
      travelAllowance,
      target,
      address,
    });

    res.status(201).json({ message: "Staff created", staff });
  } catch (err) {
    res.status(500).json({ message: "Failed to create staff", error: err.message });
  }
};

// 📄 Get all staff
exports.getAllStaff = async (req, res) => {
  try {
    const staffList = await Staff.find().sort({ createdAt: -1 });
    res.json(staffList);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch staff", error: err.message });
  }
};

// ✏️ Update staff info
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const staff = await Staff.findByIdAndUpdate(id, updates, { new: true });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.json({ message: "Staff updated", staff });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

// ❌ Delete staff
exports.deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.json({ message: "Staff deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

// 📊 Get target vs actual sale
exports.getSalesByStaff = async (req, res) => {
  try {
    const { code } = req.params;
    const buyers = await User.find({ employeeCode: code });
    const totalSales = buyers.reduce((sum, buyer) => sum + (buyer.totalOrderValue || 0), 0);

    const staff = await Staff.findOne({ employeeCode: code });
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.json({
      staffCode: code,
      target: staff.target,
      actual: totalSales,
      pending: staff.target - totalSales,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch target data", error: err.message });
  }
};
