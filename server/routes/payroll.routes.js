const express = require("express");
const router = express.Router();
const payroll = require("../controllers/payroll.controller");

router.post("/generate", payroll.generatePayroll);
router.get("/:staffId/:month", payroll.getPayroll);
router.get("/", payroll.getAllPayroll);
router.put("/mark-paid/:id", payroll.markAsPaid);

module.exports = router;
