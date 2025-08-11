// server/routes/buyer.routes.js
const express = require("express");
const router = express.Router();
const buyerCtrl = require("../controllers/buyer.controller");


// routes/buyer.routes.js
//const { imageUpload, docUpload } = require("../config/cloudinary");

router.post(
  "/",
 
  buyerCtrl.createBuyer
);

// ✅ Update buyer (replace shopImage/docs if sent)
router.put("/:id",  buyerCtrl.updateBuyer);

// ✅ List, Get, Approve, Reject, Delete
router.get("/", buyerCtrl.getAllBuyers);
router.get("/:id", buyerCtrl.getBuyerById);
router.put("/:id/approve", buyerCtrl.approveBuyer);
router.put("/:id/reject", buyerCtrl.rejectBuyer);
router.delete("/:id", buyerCtrl.deleteBuyer);

module.exports = router;
