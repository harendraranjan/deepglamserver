const mongoose = require("mongoose");
const { isValidObjectId } = mongoose;

const Order   = require("../models/order.model");
const Buyer   = require("../models/buyer.model");
const Product = require("../models/product.model");

const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toInt = v => Math.round(toNum(v)); // <- integers only

const ALLOWED_STATUSES = [
  "confirmed",
  "ready-to-dispatch",
  "dispatched",
  "delivered",
  "cancelled",
  "returned",
];

// POST /orders
exports.placeOrder = async (req, res) => {
  try {
    const {
      buyerId,
      products = [],
      address,
      pincode,
      city,
      state,
      country = "India",
      fullAddress,
      staffCode,
    } = req.body;

    if (!buyerId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "buyerId (Buyer._id) and products[] required" });
    }

    const buyer = await Buyer.findById(buyerId).populate("staffId");
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // optional snapshot update
    if (address || fullAddress || city || state || pincode) {
      buyer.shopAddress = {
        line1: address || buyer.shopAddress?.line1 || "",
        city: city || buyer.shopAddress?.city || "",
        state: state || buyer.shopAddress?.state || "",
        postalCode: pincode || buyer.shopAddress?.postalCode || "",
        country: country || buyer.shopAddress?.country || "India",
      };
      await buyer.save();
    }

    // split lines
    const withIds = products.filter(p => p.productId && isValidObjectId(String(p.productId)));
    const adHoc   = products.filter(p => !p.productId || !isValidObjectId(String(p.productId)));

    // map DB items
    let dbItems = [];
    let sellerIdCandidate = null;
    if (withIds.length) {
      const ids = withIds.map(p => String(p.productId));
      const prodDocs = await Product.find({ _id: { $in: ids } });

      dbItems = withIds.map(line => {
        const doc = prodDocs.find(d => String(d._id) === String(line.productId));
        if (!doc) return null;
        const quantity = toInt(line.quantity || line.qty || 1);
        const price    = toInt(doc.finalPrice ?? doc.mrp ?? doc.purchasePrice ?? 0);
        return {
          product: doc._id,
          brand: doc.brand || undefined,
          quantity,
          price,
          total: toInt(price * quantity),
        };
      }).filter(Boolean);

      if (dbItems.length === 1) {
        const only = prodDocs.find(d => String(d._id) === String(withIds[0].productId));
        sellerIdCandidate = only?.seller || null;
      }
    }

    // map ad-hoc items
    const adHocItems = adHoc.map(line => {
      const quantity = toInt(line.quantity || line.qty || 1);
      const price    = toInt(line.price || 0);
      return {
        quantity,
        price,
        total: toInt(price * quantity),
        brand: line.brand || undefined,
      };
    });

    const allItems = [...dbItems, ...adHocItems];
    if (!allItems.length) {
      return res.status(400).json({ message: "No valid products. Provide valid productId or price lines." });
    }

    // totals (INT)
    const totalAmount    = toInt(allItems.reduce((s, x) => s + toNum(x.total || 0), 0));
    const discountAmount = toInt(req.body.discountAmount || 0);
    const gstAmount      = toInt(req.body.gstAmount || 0);
    const finalAmount    = toInt(req.body.finalAmount ?? (totalAmount - discountAmount + gstAmount));

    // brand summary
    const brandBreakdown = allItems.reduce((acc, it) => {
      if (!it.brand) return acc;
      const hit = acc.find(b => b.brand === it.brand);
      if (hit) hit.amount = toInt(toNum(hit.amount) + toNum(it.total));
      else acc.push({ brand: it.brand, amount: toInt(it.total) });
      return acc;
    }, []);

    const orderDoc = await Order.create({
      buyerId: buyer._id,
      staffId: buyer.staffId,
      staffCode: staffCode || buyer.staffCode || buyer.employeeCode || undefined,
      sellerId: sellerIdCandidate || undefined,

      pincode: buyer.shopAddress?.postalCode || pincode || "",
      city: buyer.shopAddress?.city || city || "",
      state: buyer.shopAddress?.state || state || "",
      country: buyer.shopAddress?.country || country || "India",
      fullAddress: fullAddress || buyer.shopAddress?.line1 || address || "",

      products: allItems,
      product: withIds.length === 1 ? withIds[0].productId : undefined,

      brandBreakdown,
      totalAmount,
      discountAmount,
      gstAmount,
      finalAmount,

      status: req.body.status || "confirmed",
      paymentStatus: req.body.paymentStatus || "unpaid",

      invoiceUrl: req.body.invoiceUrl,
      sellerInvoiceUrl: req.body.sellerInvoiceUrl,

      isReturnRequested: false,
      returnReason: "",
    });

    return res.status(201).json({ message: "Order placed", order: orderDoc });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ message: "Order placement failed", error: err.message });
  }
};

// GET /orders
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyerId", "name phone email")
      .populate("sellerId", "brandName userId")
      .populate("staffId", "name employeeCode")
      .populate("products.product", "productname finalPrice brand")
      .populate("product", "productname finalPrice brand")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, items: orders });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch orders", error: err.message });
  }
};

// GET /orders/:id
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyerId", "name phone email")
      .populate("staffId", "name employeeCode")
      .populate("sellerId", "brandName")
      .populate("products.product", "productname finalPrice brand")
      .populate("product", "productname finalPrice brand");

    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.json({ ok: true, order });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch order", error: err.message });
  }
};

// PATCH /orders/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { status, note, reason } = req.body;
    if (!status) return res.status(400).json({ message: "Status is required" });
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;

    if (status === "returned") {
      if (reason) order.returnReason = reason;
      order.isReturnRequested = true;
    }
    if (status === "cancelled" && reason) {
      order.returnReason = reason;
      order.isReturnRequested = false;
    }

    order.logs = order.logs || [];
    order.logs.push({
      action: status.toUpperCase(),
      note: note || reason || "",
      by: req.user?._id,
      at: new Date(),
    });

    await order.save();
    return res.json({ message: `Order marked as ${status}`, order });
  } catch (err) {
    return res.status(500).json({ message: "Failed to update status", error: err.message });
  }
};

// Shortcuts
exports.markPacked = (req, res) =>
  exports.updateStatus({ ...req, body: { status: "ready-to-dispatch", note: req.body?.note } }, res);

exports.markDelivered = (req, res) =>
  exports.updateStatus({ ...req, body: { status: "delivered", note: req.body?.note } }, res);
