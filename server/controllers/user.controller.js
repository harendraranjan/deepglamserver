const User = require("../models/user.model");
const Staff = require("../models/staff.model");

// ✅ Get all buyers (admin use)
exports.getAllBuyers = async (req, res) => {
  try {
    const buyers = await User.find({ role: "buyer" }).populate("address");
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyers", error: err.message });
  }
};

// ✅ Approve buyer
exports.approveBuyer = async (req, res) => {
  try {
    const buyerId = req.params.id;
    const buyer = await User.findById(buyerId);

    if (!buyer || buyer.role !== "buyer") {
      return res.status(404).json({ message: "Buyer not found" });
    }

    buyer.isApproved = true;
    buyer.isRejected = false;
    buyer.rejectReason = "";
    await buyer.save();

    res.json({ message: "Buyer approved" });
  } catch (err) {
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

// ❌ Reject buyer
exports.rejectBuyer = async (req, res) => {
  try {
    const buyerId = req.params.id;
    const { reason } = req.body;

    const buyer = await User.findById(buyerId);
    if (!buyer || buyer.role !== "buyer") {
      return res.status(404).json({ message: "Buyer not found" });
    }

    buyer.isApproved = false;
    buyer.isRejected = true;
    buyer.rejectReason = reason || "Rejected by admin";
    await buyer.save();

    res.json({ message: "Buyer rejected" });
  } catch (err) {
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};

// 🔍 Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("address");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user", error: err.message });
  }
};

// ✏️ Update profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    const user = await User.findByIdAndUpdate(userId, updates, { new: true });
    res.json({ message: "Profile updated", user });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

// 📦 Get buyers under staff code
exports.getBuyersByStaffCode = async (req, res) => {
  try {
    const staffCode = req.params.code;
    const buyers = await User.find({ employeeCode: staffCode, role: "buyer" });
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyers", error: err.message });
  }
};
