// server/app.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

// Trust reverse proxy (Render/NGINX etc.)
app.set("trust proxy", 1);

// Core middlewares
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

// Serve local uploads (used when Cloudinary fallback is active)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ---------------------------
 * Route imports
 * --------------------------- */
const authRoutes = require("./routes/auth.routes");
//const userRoutes = require("./routes/user.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const wishlistRoutes = require("./routes/wishlist.routes");
const staffRoutes = require("./routes/staff.routes");
const sellerRoutes = require("./routes/seller.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const payrollRoutes = require("./routes/payroll.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const masterRoutes = require("./routes/master.routes");
const notificationRoutes = require("./routes/notification.routes");
const buyerRoutes = require("./routes/buyer.routes"); // 👈 added

/* ---------------------------
 * Mount routes (prefixes)
 * --------------------------- */
app.use("/api/auth", authRoutes);
//app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/sellers", sellerRoutes); // if you want singular: change to /api/seller
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/buyers", buyerRoutes); // 👈 added

// Health check
app.get("/", (_req, res) => res.send("DeepGlam API running..."));

app.use("/public", express.static(path.join(__dirname, "public")));

/* ---------------------------
 * 404 + Error handler
 * --------------------------- */
app.use((req, res, _next) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("🔥 Server error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
});

module.exports = app;
