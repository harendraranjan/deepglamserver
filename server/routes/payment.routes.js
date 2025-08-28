// server/routes/payment.routes.js
const router = require("express").Router();
const paytm = require("../controllers/payment.controller.paytm");
router.post("/paytm/init/:invoiceId", paytm.initPaytmForInvoice);
module.exports = router;
