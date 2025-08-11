

const Seller = require('../models/seller.model'); // ✅ yeh line yahan add karo
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
/*

exports.createSeller = async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    brandName,
    gstNumber,
    aadhaarFrontImage,
    aadhaarBackImage,
  } = req.body;

  try {
    // 🔍 Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 👤 Create User (for login)
    const user = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      role: 'seller',
    });

    await user.save();

    // 🏪 Create Seller Profile
    const seller = new Seller({
      userId: user._id,
      brandName,
      gstNumber,
      aadhaarCard: {
        frontImage: aadhaarFrontImage,
        backImage: aadhaarBackImage,
      },
      isActive: true, // Default
    });

    await seller.save();

    res.status(201).json({
      success: true,
      message: 'Seller registered successfully. You can now log in.',
    });

  } catch (err) {
    console.error('Seller Registration Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Seller registration failed',
      error: err.message,
    });
  }
}; */

/*
exports.createSeller = async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    brandName,
    gstNumber,
   fullAddress,// ✅ camelCase me rakho
    aadhaarFrontImage,
    aadhaarBackImage,
  } = req.body;

  let userId = null;

  try {
    // 🔹 User create karne ki koshish
    try {
      const existingUser = await User.findOne({ $or: [{ email }, { phone }] });

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
          name,
          email,
          phone,
          password: hashedPassword,
          fullAddress,
          role: 'seller',
        });
        const savedUser = await user.save();
        userId = savedUser._id;
      } else {
        userId = existingUser._id;
      }
    } catch (userError) {
      console.warn("⚠️ User creation failed, continuing with seller creation:", userError.message);
    }

    // 🔹 Seller profile create karo (userId null ho sakta hai)
    const seller = new Seller({
      userId: userId || null, // null allowed
      brandName,
      gstNumber,
      fullAddress,
      aadhaarCard: {
        frontImage: aadhaarFrontImage,
        backImage: aadhaarBackImage,
      },
      isActive: true,
    });

    await seller.save();

    res.status(201).json({
      success: true,
      message: '✅ Seller profile created successfully (user creation optional).',
      seller,
    });

  } catch (err) {
    console.error('❌ Seller Creation Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Seller creation failed',
      error: err.message,
    });
  }
};

*/
// server/controllers/seller.controller.js

const parseMaybeJSON = (val) => {
  if (!val) return undefined;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return undefined; }
};

exports.createSeller = async (req, res) => {
  try {
    const {
      // allow both naming styles from client
      name, fullName,
      phone, mobile,
      email, password,
      brandName, gstNumber,
      fullAddress, line1, line2, postalCode, city, state, country,
      aadhaarFrontUrl, aadhaarBackUrl,
    } = req.body;

    const sellerName = fullName || name;
    const sellerPhone = mobile || phone;

    if (!sellerName || !sellerPhone || !email || !password || !brandName || !gstNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Address: support flat or object
    let addr = parseMaybeJSON(fullAddress);
    if (!addr) {
      addr = { line1, line2, postalCode, city, state, country: country || 'India' };
    }
    if (!addr?.line1 || !addr?.postalCode || !addr?.city || !addr?.state) {
      return res.status(400).json({
        success: false,
        message: "Please provide complete address (line1, postalCode, city, state)."
      });
    }

    // User create or reuse
    let user = await User.findOne({ $or: [{ email }, { phone: sellerPhone }] });
    if (!user) {
      const hash = await bcrypt.hash(password, 10);
      user = await User.create({
        name: sellerName,
        email,
        phone: sellerPhone,
        password: hash,
        role: 'seller',
        fullAddress: addr,
      });
    }

    const seller = await Seller.create({
      userId: user._id,
      brandName,
      gstNumber,
      fullAddress: addr,
      aadhaarCard: {
        front: { url: aadhaarFrontUrl || undefined },
        back: { url: aadhaarBackUrl || undefined },
      },
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: '✅ Seller profile created successfully',
      seller
    });
  } catch (error) {
    console.error('❌ Seller creation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Seller creation failed',
      error: error.message
    });
  }
};



// ✅ Get all sellers (admin) with optional status filter
exports.getAllSellers = async (req, res) => {
  try {
    const { status } = req.query; // "approved" | "disapproved"

    let filter = {};
    if (status === "approved") {
      filter.isActive = true;
    } else if (status === "disapproved") {
      filter.isActive = false;
    }

    const sellers = await Seller.find(filter)
      .populate("userId", "name email phone isApproved")
      .sort({ createdAt: -1 });

    res.json(sellers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sellers", error: err.message });
  }
};

// ✅ Approve Seller (Admin only)
exports.approveSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;

    // 1) Seller find karo
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    // 2) Related user find karo
    const user = await User.findById(seller.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found for this seller" });
    }

    // 3) Approve
    seller.isActive = true;
    await seller.save();

    user.isApproved = true;
    await user.save();

    return res.status(200).json({
      message: "Seller approved successfully",
      seller,
      user
    });
  } catch (err) {
    console.error("approveSeller error:", err);
    return res.status(500).json({ message: "Failed to approve seller", error: err.message });
  }
};


// ❌ Reject seller
exports.rejectSeller = async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    seller.isApproved = false;
    seller.isRejected = true;
    seller.rejectReason = reason;
    await seller.save();

    await User.findByIdAndUpdate(seller.userId, { isSellerApproved: false });

    res.json({ message: "Seller rejected" });
  } catch (err) {
    res.status(500).json({ message: "Rejection failed", error: err.message });
  }
};

// 📃 Get All Disapproved Sellers
exports.getDisapprovedSellers = async (req, res) => {
  try {
    const sellers = await Seller.find({ isActive: false })
      .populate("userId", "name email phone isApproved")
      .sort({ createdAt: -1 });

    res.status(200).json(sellers);
  } catch (err) {
    console.error("getDisapprovedSellers error:", err);
    res.status(500).json({ message: "Failed to fetch disapproved sellers", error: err.message });
  }
};


// ✏️ Update seller profile
exports.updateSeller = async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    res.json({ message: "Seller updated", seller });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

// 🔍 Get seller by ID
exports.getSellerById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).populate("userId");
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    res.json(seller);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};
