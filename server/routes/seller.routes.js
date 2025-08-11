const express = require("express");
const router = express.Router();
const sellerCtrl = require("../controllers/seller.controller");
// routes/seller.routes.js
router.get("/sellers/disapproved", sellerCtrl.getDisapprovedSellers);
router.put("/approve/:sellerId",  sellerCtrl.approveSeller);
// 👤 Admin actions
router.get("/", sellerCtrl.getAllSellers);
router.post("/", sellerCtrl.createSeller);
//router.put("/approve/:id", sellerCtrl.approveSeller);
router.put("/reject/:id", sellerCtrl.rejectSeller);

// 🔄 Update/fetch seller profile
router.put("/:id", sellerCtrl.updateSeller);
router.get("/:id", sellerCtrl.getSellerById);

module.exports = router;
