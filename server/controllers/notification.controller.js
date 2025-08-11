const Notification = require("../models/notification.model");
const User = require("../models/user.model");
//const admin = require("firebase-admin"); // Must be initialized in firebase.utils.js

// ✅ Send push notification to a user
exports.sendNotification = async (req, res) => {
  try {
    const { userId, title, body, type } = req.body;

    const user = await User.findById(userId);
    if (!user?.fcmToken) {
      return res.status(404).json({ message: "FCM token not found for user" });
    }

    const payload = {
      notification: {
        title,
        body,
      },
      data: {
        type: type || "general",
      },
    };

    const result = await admin.messaging().sendToDevice(user.fcmToken, payload);

    await Notification.create({ userId, title, body, type });

    res.json({ message: "Notification sent", firebase: result });
  } catch (err) {
    res.status(500).json({ message: "Failed to send notification", error: err.message });
  }
};

// 📩 Get notifications for user
exports.getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notifications", error: err.message });
  }
};

// ✅ Mark as seen
exports.markAsSeen = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { seen: true });
    res.json({ message: "Notification marked as seen" });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark notification", error: err.message });
  }
};
