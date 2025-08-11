const express = require("express");
const router = express.Router();
const staffCtrl = require("../controllers/staff.controller");

// 👤 Admin routes
router.post("/", staffCtrl.createStaff);
router.get("/", staffCtrl.getAllStaff);
router.put("/:id", staffCtrl.updateStaff);
router.delete("/:id", staffCtrl.deleteStaff);

// 📊 Staff performance
router.get("/sales/:code", staffCtrl.getSalesByStaff);

module.exports = router;
