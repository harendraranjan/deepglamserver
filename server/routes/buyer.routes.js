// server/routes/buyer.routes.js
const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const buyerCtrl = require("../controllers/buyer.controller");

// Create / Update / Delete / Read
router.post("/", buyerCtrl.createBuyer);
router.get("/",  buyerCtrl.getAllBuyers);
router.get("/:id", buyerCtrl.getBuyerById);
router.patch("/:id",  buyerCtrl.updateBuyer);
router.delete("/:id",  buyerCtrl.deleteBuyer);

// Staff linking
router.patch("/:id/assign-staff",  buyerCtrl.assignStaff);

// Address
router.patch("/:id/address",  buyerCtrl.setAddress);

// Buyer Orders (list + detail)
router.get("/:id/orders",  buyerCtrl.getBuyerOrders);
router.get("/:id/orders/:orderId",  buyerCtrl.getBuyerOrderById);

module.exports = router;
