const express = require('express');
const router = express.Router();
const masterController = require('../controllers/master.controller');
//const verifyToken = require('../middlewares/verifyToken');

// Optional: Restrict all master routes to admin only
//router.use(verifyToken);

// 📦 HSN
router.post('/hsn', masterController.createHSN);
router.get('/hsn', masterController.getHSNs);

// 🌍 Location
router.post('/location', masterController.upsertLocation);
router.get('/location/:pincode', masterController.getLocation);

// 💰 Profit %
router.post('/profit', masterController.setProfit);
router.get('/profit', masterController.getProfits);

// 🖼️ Banner
router.post('/banner', masterController.createBanner);
router.get('/banner', masterController.getBanners);

module.exports = router;
