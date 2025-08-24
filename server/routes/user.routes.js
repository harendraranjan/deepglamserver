const express = require("express");
const router = express.Router();
const userCtrl = require("../controllers/user.controller");
const protect = require("../middlewares/auth.middleware");
// 🔓 Public (optional protect with `protect`)
router.get("/:id", userCtrl.getUserById);
router.put("/:id", userCtrl.updateProfile);

// 👤 Admin-only
router.get("/staff/:code", userCtrl.getBuyersByStaffCode);
router.get("/", userCtrl.getAllBuyers);
router.put("/approve/:id", userCtrl.approveBuyer);
router.put("/reject/:id", userCtrl.rejectBuyer);

module.exports = router;
