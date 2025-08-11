// controllers/buyer.controller.js
const Buyer = require("../models/buyer.model");
const bcrypt = require("bcryptjs");

// Yeh helper function yahin add kar do:
function maybeJSON(input) {
  if (!input) return null;
  if (typeof input === 'object') return input; // Already parsed
  try {
    return JSON.parse(input);
  } catch (err) {
    return null; // Return null if not valid JSON
  }
}

//const bcrypt = require('bcryptjs');
//const Buyer = require('../models/buyer.model');
const User = require('../models/user.model'); // import karo User model
const { generateToken } = require('../utils/token.utils'); // token generator



// ✅ helpers (proper declarations)
const normalizeDocType = (t = '') => {
  const x = String(t || '').trim().toLowerCase();
  if (['aadhaar', 'aadhaar card', 'aadhar', 'aadhar card'].includes(x)) return 'AADHAAR';
  if (['pan', 'pan card'].includes(x)) return 'PAN';
  if (['udyam', 'udyam certificate'].includes(x)) return 'UDYAM';
  if (['gst', 'gst certificate'].includes(x)) return 'GST';
  return 'OTHER';
};

const toImageObj = (url) => (url ? { url, public_id: undefined } : undefined);

const parseMaybeJSON = (val) => {
  if (!val) return undefined;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return undefined; }
};

exports.createBuyer = async (req, res) => {
  try {
    const {
      employeeCode, name, mobile, email, gender,
      shopName, shopAddress, country, state, city, postalCode,
      password,
      documents, // [{ type, number, fileUrl }]
      bankName, branchName, accountHolderName, accountNumber, ifscCode, beneficiaryName,
      shopImageUrl,
    } = req.body;

    if (!employeeCode || !name || !mobile || !gender || !shopName) {
      return res.status(400).json({ message: "employeeCode, name, mobile, gender, shopName are required" });
    }

    const dup = await Buyer.findOne({ $or: [{ mobile }, ...(email ? [{ email }] : [])] });
    if (dup) return res.status(400).json({ message: "Buyer already exists with same mobile/email" });

    let passwordHash;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    // address (object chaahiye)
    const addr = parseMaybeJSON(shopAddress) || shopAddress; // object ya string -> object
    if (!addr || typeof addr !== 'object') {
      return res.status(400).json({ message: 'shopAddress must be an object {line1, state, city, postalCode, country?}' });
    }

    // documents normalize
    let docs = parseMaybeJSON(documents) || documents || [];
    if (!Array.isArray(docs)) docs = [docs];
    const mappedDocs = docs
      .filter(Boolean)
      .map(d => ({
        type: normalizeDocType(d.type),
        number: d.number,
        file: toImageObj(d.fileUrl),
      }));

    const buyer = await Buyer.create({
      employeeCode,
      name,
      mobile,
      email,
      gender,
      passwordHash,

      shopName,
      shopImage: toImageObj(shopImageUrl),
      shopAddress: {
        line1: addr.line1,
        line2: addr.line2,
        country: addr.country || country || 'India',
        state: addr.state,
        city: addr.city,
        postalCode: addr.postalCode,
      },

      // mirror duplicates (optional)
      country: addr.country || country || 'India',
      state: addr.state,
      city: addr.city,
      postalCode: addr.postalCode,

      documents: mappedDocs,

      bank: {
        bankName,
        branchName,
        accountHolderName,
        accountNumber,
        ifscCode,
        beneficiaryName,
      },

      isApproved: true,
    });

    return res.status(201).json({ message: 'Buyer created', buyer });
  } catch (err) {
    console.error('createBuyer error:', err);
    return res.status(500).json({ message: 'Failed to create buyer', error: err.message });
  }
};


// ✅ Update Buyer (replace shopImage if sent, replace documents if sent)
exports.updateBuyer = async (req, res) => {
  try {
    const {
      name,
      mobile,
      email,
      gender,
      shopName,
      shopAddress,
      country,
      state,
      city,
      postalCode,
      documents, // new docs meta (optional)
      bankName,
      branchName,
      accountHolderName,
      accountNumber,
      ifscCode,
      beneficiaryName,
      password, // optional: reset password
    } = req.body;

    const up = {};
    if (name) up.name = name;
    if (mobile) up.mobile = mobile;
    if (email) up.email = email;
    if (gender) up.gender = gender;
    if (shopName) up.shopName = shopName;
    if (shopAddress) up.shopAddress = maybeJSON(shopAddress);
    if (country) up.country = country;
    if (state) up.state = state;
    if (city) up.city = city;
    if (postalCode) up.postalCode = postalCode;

    // password reset
    if (password) {
      const salt = await bcrypt.genSalt(10);
      up.passwordHash = await bcrypt.hash(password, salt);
    }

    // shop image replace
    const shopImageFile = req.files?.shopImage?.[0];
    if (shopImageFile) up.shopImage = toFileObj(shopImageFile);

    // documents replace (if meta or files provided)
    const hasDocMeta = !!documents;
    const hasDocFiles = (req.files?.docImages?.length || 0) > 0;
    if (hasDocMeta || hasDocFiles) {
      let docsMeta = maybeJSON(documents) || [];
      if (!Array.isArray(docsMeta)) docsMeta = [docsMeta];
      const docFiles = req.files?.docImages || [];
      up.documents = docsMeta.map((d, idx) => ({
        type: d.type,
        number: d.number,
        file: toFileObj(docFiles[idx]),
      }));
    }

    // bank update if any bank field present
    if (bankName || branchName || accountHolderName || accountNumber || ifscCode || beneficiaryName) {
      up.bank = {
        ...(bankName ? { bankName } : {}),
        ...(branchName ? { branchName } : {}),
        ...(accountHolderName ? { accountHolderName } : {}),
        ...(accountNumber ? { accountNumber } : {}),
        ...(ifscCode ? { ifscCode } : {}),
        ...(beneficiaryName ? { beneficiaryName } : {}),
      };
    }

    const buyer = await Buyer.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    res.json({ message: "Buyer updated", buyer });
  } catch (err) {
    console.error("updateBuyer error:", err);
    res.status(500).json({ message: "Failed to update buyer", error: err.message });
  }
};

// ✅ Get / List / Approve / Reject (unchanged from before; include if needed)
exports.getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    res.json(buyer);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyer", error: err.message });
  }
};

exports.getAllBuyers = async (req, res) => {
  try {
    const { approved, search, employeeCode, page = 1, limit = 20 } = req.query;
    const q = {};
    if (approved === "true") q.isApproved = true;
    if (approved === "false") q.isApproved = false;
    if (employeeCode) q.employeeCode = employeeCode;
    if (search) {
      q.$or = [
        { shopName: new RegExp(search, "i") },
        { name: new RegExp(search, "i") },
        { mobile: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Buyer.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Buyer.countDocuments(q),
    ]);
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyers", error: err.message });
  }
};

exports.approveBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    res.json({ message: "Buyer approved", buyer });
  } catch (err) {
    res.status(500).json({ message: "Failed to approve buyer", error: err.message });
  }
};

exports.rejectBuyer = async (req, res) => {
  try {
    const buyer = await Buyer.findByIdAndUpdate(req.params.id, { isApproved: false }, { new: true });
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    res.json({ message: "Buyer rejected", buyer });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject buyer", error: err.message });
  }
};
exports.deleteBuyer = async (req, res) => {
  try {
    const deleted = await Buyer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Buyer not found" });
    res.json({ message: "Buyer deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete buyer", error: err.message });
  }
};
