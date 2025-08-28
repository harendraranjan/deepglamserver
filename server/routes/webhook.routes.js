// server/routes/webhook.routes.js
const router = require("express").Router();
const whPaytm = require("../controllers/webhook.controller.paytm");
router.post("/paytm", whPaytm.paytmWebhook); // set in Paytm dashboard
module.exports = router;
