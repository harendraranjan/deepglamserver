// controllers/auth.controller.js
const User = require("../models/user.model");
const Buyer = require("../models/buyer.model"); // <-- buyer link yahin se
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendOtp } = require("../utils/otp.utils");

// Helper: JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Helper: role_Id (only buyer -> Buyer._id via userId)
async function getRoleId(user) {
  if (!user) return null;
  if (user.role === "buyer") {
    const buyer = await Buyer.findOne({ userId: user._id }).select("_id").lean();
    return buyer ? buyer._id : null;
  }
  return null; // other roles not mapped here
}

// 📌 Register user (unchanged behavior)
exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;

    const userExists = await User.findOne({ phone });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role,
    });

    res.status(201).json({ message: "Registered successfully", user });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

/*
// 🔐 Old login (commented by you) — keeping as reference
exports.login = async (req, res) => { ... }
*/

// 🔐 Login with identifier (phone/email) + password
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ phone: identifier }, { email: identifier }],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    if (!user.isApproved) {
      return res.status(403).json({ message: "Account pending approval" });
    }

    const role_Id = await getRoleId(user); // <-- buyerId if buyer

    res.json({
      token: generateToken(user),
      user,
      role_Id,
    });
  } catch (err) {
    res.status(500).json({ message: "Login error", error: err.message });
  }
};

// 📲 Send OTP (demo)
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Phone required" });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await sendOtp(phone, otp); // integrate real SMS API
    // TODO: Prod me OTP ko DB/Redis me expiry ke saath store karein
    res.json({ message: "OTP sent", otp });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
};

// 🔑 OTP Login (demo OTP = 123456)
exports.otpLogin = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    // TODO: Replace with real OTP verification
    if (otp !== "123456") return res.status(401).json({ message: "Invalid OTP" });

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isApproved) return res.status(403).json({ message: "Not approved" });

    const role_Id = await getRoleId(user); // <-- buyerId if buyer

    res.json({
      token: generateToken(user),
      user,
      role_Id,
    });
  } catch (err) {
    res.status(500).json({ message: "OTP login error", error: err.message });
  }
};

// 🔁 Reset Password via OTP (demo OTP = 123456)
exports.resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  try {
    if (otp !== "123456") return res.status(401).json({ message: "Invalid OTP" });

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: "Password reset failed", error: err.message });
  }
};
