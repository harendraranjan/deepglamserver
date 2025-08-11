const express = require("express");
const router = express.Router();
const sellerCtrl = require("../controllers/seller.controller");
const upload = require('../middlewares/upload.middleware'); // your multer config
// routes/seller.routes.js
router.get("/sellers/disapproved", sellerCtrl.getDisapprovedSellers);
router.put("/approve/:sellerId",  sellerCtrl.approveSeller);
// 👤 Admin actions
/*
router.post(
  "/",
  upload.fields([
    { name: 'aadhaarFrontImage', maxCount: 1 },
    { name: 'aadhaarBackImage', maxCount: 1 },
  ]),
  sellerCtrl.createSeller
);*/
router.get("/", sellerCtrl.getAllSellers);
router.post("/", upload.single('shopImage'), sellerCtrl.createSeller);
//router.put("/approve/:id", sellerCtrl.approveSeller);
router.put("/reject/:id", sellerCtrl.rejectSeller);

// 🔄 Update/fetch seller profile
router.put("/:id", sellerCtrl.updateSeller);
router.get("/:id", sellerCtrl.getSellerById);

module.exports = router;
