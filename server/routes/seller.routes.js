// server/routes/seller.routes.js
const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const sellerCtrl = require("../controllers/seller.controller");

// ---------- Create ----------
router.post("/",  sellerCtrl.createSeller);

// ---------- Read ----------
router.get("/",  sellerCtrl.getAllSellers);
router.get("/profile",  sellerCtrl.getMyProfile);
router.get("/disapproved", sellerCtrl.getDisapprovedSellers);
router.get("/:id",  sellerCtrl.getSellerById);

// ---------- Update / Approvals ----------
router.patch("/:id",  sellerCtrl.updateSeller);
router.patch("/:sellerId/approve",  sellerCtrl.approveSeller);
router.patch("/:id/reject",  sellerCtrl.rejectSeller);

// ---------- Seller Dashboard / Products ----------

router.get("/my/products", sellerCtrl.getMyProducts);
router.get("/my/stats",  sellerCtrl.getMyStats);

// ---------- Orders (filters + shortcuts) ----------
router.get("/my/orders", sellerCtrl.getMyOrders);               // ?status=&today=true&from=&to=&page=&limit=
router.get("/my/orders/today", sellerCtrl.getMyTodayOrders);
router.get("/my/orders/cancelled", sellerCtrl.getMyCancelledOrders);
router.get("/my/orders/returned", sellerCtrl.getMyReturnedOrders);
router.get("/my/orders/delivered", sellerCtrl.getMyDeliveredOrders);

module.exports = router;
