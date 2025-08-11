const express = require("express");
const router = express.Router();
const notification = require("../controllers/notification.controller");

router.post("/send", notification.sendNotification);
router.get("/:userId", notification.getUserNotifications);
router.put("/seen/:id", notification.markAsSeen);

module.exports = router;
