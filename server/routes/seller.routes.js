const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const sellerCtrl = require("../controllers/seller.controller");

// ---------- Create (linked to logged-in user) ----------
router.post("/", verifyJWT, sellerCtrl.createSeller);

// ---------- Seller Dashboard / Products ----------
router.get("/my/products", verifyJWT, sellerCtrl.getMyProducts);
router.get("/my/stats", verifyJWT, sellerCtrl.getMyStats);

// ---------- Orders (filters + shortcuts) ----------
router.get("/my/orders", verifyJWT, sellerCtrl.getMyOrders);
router.get("/my/orders/today", verifyJWT, sellerCtrl.getMyTodayOrders);
router.get("/my/orders/cancelled", verifyJWT, sellerCtrl.getMyCancelledOrders);
router.get("/my/orders/returned", verifyJWT, sellerCtrl.getMyReturnedOrders);
router.get("/my/orders/delivered", verifyJWT, sellerCtrl.getMyDeliveredOrders);

// ---------- Profile ----------
router.get("/profile", verifyJWT, sellerCtrl.getMyProfile);
//router.patch("/profile", verifyJWT, sellerCtrl.updateMyProfile);

// ---------- Admin: Manage Sellers ----------
router.get("/", sellerCtrl.getAllSellers);
router.get("/disapproved", sellerCtrl.getDisapprovedSellers);
router.get("/:id", sellerCtrl.getSellerById); // 👈 keep this at the end
router.patch("/:sellerId/approve", sellerCtrl.approveSeller);
router.patch("/:id/reject", sellerCtrl.rejectSeller);

module.exports = router;
