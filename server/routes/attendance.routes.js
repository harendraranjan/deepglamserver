const express = require("express");
const router = express.Router();
const attendance = require("../controllers/attendance.controller");

router.post("/check-in", attendance.markCheckIn);
router.post("/check-out", attendance.markCheckOut);
router.get("/:staffId/:month", attendance.getAttendanceByStaff);

module.exports = router;
