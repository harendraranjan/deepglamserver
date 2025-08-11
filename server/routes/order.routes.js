const express = require("express");
const router = express.Router();
const order = require("../controllers/order.controller");

router.post("/", order.placeOrder);
router.get("/", order.getAllOrders);
router.get("/:id", order.getOrderById);
router.put("/status/:id", order.updateStatus);
router.put("/payment/:id", order.updatePaymentStatus);
router.put("/return/:id", order.requestReturn);

module.exports = router;
