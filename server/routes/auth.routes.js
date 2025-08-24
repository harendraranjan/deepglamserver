const express = require("express");
const router = express.Router();
const authCtrl = require("../controllers/auth.controller");
const { getAllUsersAdmin } = require("../controllers/auth.controller");


router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);
router.post("/send-otp", authCtrl.sendOtp);
router.post("/otp-login", authCtrl.otpLogin);
router.post("/reset-password", authCtrl.resetPassword);

// ✅ GET /api/users/admin
router.get("/alluser", getAllUsersAdmin);

module.exports = router;
