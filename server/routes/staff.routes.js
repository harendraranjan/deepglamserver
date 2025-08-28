const express = require("express");
const router = express.Router();
const staffCtrl = require("../controllers/staff.controller");
const { verifyJWT } = require("../middlewares/auth.middleware");

// --- CRUD staff ---
router.post("/",             staffCtrl.createStaff);
router.get("/",              staffCtrl.getAllStaff);
router.get("/:code",         staffCtrl.getStaffByCode);
router.patch("/:id",         staffCtrl.updateStaff);

// --- Attendance ---
router.post("/attendance/check-in",   staffCtrl.checkIn);
router.post("/attendance/check-out",  staffCtrl.checkOut);
router.get("/attendance/me",          staffCtrl.myAttendance);

// --- Summary / Buyers / Orders ---
router.get("/summary/me",    staffCtrl.mySummary);
router.get("/buyers",  verifyJWT,   staffCtrl.myBuyers);
router.get("/orders",        staffCtrl.myOrders);
router.get("/orders/count",  staffCtrl.myOrdersCount);

// --- Orders workflow (dispatch + invoice) ---
router.patch("/orders/:id/ready-to-dispatch", verifyJWT,  staffCtrl.markReadyToDispatch);

// --- Payments ---
router.get("/payments/pending",  staffCtrl.pendingPaymentsByStaff);
router.post("/payments/collect",  staffCtrl.collectPayment);

// --- Targets & Reports ---
router.post("/:staffId/target",       staffCtrl.setTarget);
router.get("/:staffId/target",        staffCtrl.getTarget);
router.get("/:staffId/sales-report",  staffCtrl.getSalesReport);

module.exports = router;
