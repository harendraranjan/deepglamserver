const express = require("express");
const router = express.Router();
const analytics = require("../controllers/analytics.controller");

router.get("/staff-performance", analytics.getStaffPerformance);
router.get("/top-products", analytics.getTopSellingProducts);
router.get("/buyer-activity", analytics.getBuyerActivity);

module.exports = router;
