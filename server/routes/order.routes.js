const express = require("express");
const router = express.Router();

const { verifyJWT } = require("../middlewares/auth.middleware");
const orderCtrl = require("../controllers/order.controller");
//const staffCtrl = require("../controllers/staff.controller"); // dispatch + invoice

// Place & Read
router.post("/",verifyJWT,  orderCtrl.placeOrder);
router.get("/",  orderCtrl.getAllOrders);
router.get("/:id",  orderCtrl.getOrderById);

// Status Transitions
router.patch("/:id/pack",  orderCtrl.markPacked);

// Dispatch → (invoice/AWB etc.) handle in staffCtrl
//router.post("/:id/dispatch",  staffCtrl.markReadyToDispatch);

router.patch("/:id/deliver",  orderCtrl.markDelivered);

// Generic status (cancel/return/admin override)
router.patch("/:id/status", orderCtrl.updateStatus);

// Convenience aliases
router.patch("/:id/cancel",  (req, res) =>
  orderCtrl.updateStatus({ ...req, body: { status: "cancelled", note: req.body?.note, reason: req.body?.reason } }, res)
);
router.patch("/:id/return", (req, res) =>
  orderCtrl.updateStatus({ ...req, body: { status: "returned", reason: req.body?.reason, note: req.body?.note } }, res)
);

module.exports = router;
