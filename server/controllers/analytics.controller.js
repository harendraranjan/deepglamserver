const Order = require("../models/order.model");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const Staff = require("../models/staff.model");

// 📊 Target vs Actual Sale by Staff
exports.getStaffPerformance = async (req, res) => {
  try {
    const staffList = await Staff.find();
    const result = [];

    for (const staff of staffList) {
      const buyers = await User.find({ employeeCode: staff.employeeCode });
      let total = 0;

      for (const buyer of buyers) {
        const orders = await Order.find({ buyerId: buyer._id, status: "delivered" });
        total += orders.reduce((sum, o) => sum + o.finalAmount, 0);
      }

      result.push({
        staff: staff.name,
        code: staff.employeeCode,
        target: staff.target,
        actual: total,
        pending: Math.max(staff.target - total, 0),
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to calculate staff performance", error: err.message });
  }
};

// 📦 Product Sale Count
exports.getTopSellingProducts = async (req, res) => {
  try {
    const orders = await Order.find({ status: "delivered" });

    const productCount = {};
    for (const order of orders) {
      for (const item of order.products) {
        const id = item.product.toString();
        productCount[id] = (productCount[id] || 0) + item.quantity;
      }
    }

    const sorted = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // top 10

    const products = await Product.find({ _id: { $in: sorted.map(([id]) => id) } });

    const ranked = sorted.map(([id, qty]) => {
      const product = products.find(p => p._id.toString() === id);
      return {
        product: product?.productName || "Unknown",
        quantity: qty,
      };
    });

    res.json(ranked);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch product analytics", error: err.message });
  }
};

// 🧾 Buyer Activity Report
exports.getBuyerActivity = async (req, res) => {
  try {
    const buyers = await User.find({ role: "buyer" });
    const result = [];

    for (const buyer of buyers) {
      const orders = await Order.find({ buyerId: buyer._id });
      const totalAmount = orders.reduce((sum, o) => sum + o.finalAmount, 0);
      const lastOrder = orders.length ? orders[orders.length - 1].createdAt : null;

      result.push({
        buyer: buyer.name,
        phone: buyer.phone,
        totalOrders: orders.length,
        totalAmount,
        lastOrder,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch buyer activity", error: err.message });
  }
};
