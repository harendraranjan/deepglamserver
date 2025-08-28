// controllers/orders.controller.js
const mongoose = require("mongoose");
const { isValidObjectId } = mongoose;

const Order   = require("../models/order.model");
const Buyer   = require("../models/buyer.model");
const Product = require("../models/product.model");

const {
  resolveBuyerId,
  resolveStaffId,
  resolveSellerId,
} = require("../utils/authResolvers");

/* ---------- utils ---------- */
const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toInt = v => Math.round(toNum(v));

const ALLOWED_STATUSES = [
  "confirmed",
  "ready-to-dispatch",
  "dispatched",
  "delivered",
  "cancelled",
  "returned",
];

/* -----------------------------------
   POST /orders  (place order)
   - Resolves buyer by token userId
   - Optionally snapshots address
   - Computes totals safely
------------------------------------*/
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      products = [],
      address,
      pincode,
      city,
      state,
      country = "India",
      fullAddress,
      staffCode,    // optional force override (kept for back-compat)
    } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "products[] required" });
    }

    // ---- resolve buyer for the logged-in user ----
    const buyerId = await resolveBuyerId(req);
    if (!buyerId) return res.status(404).json({ message: "Buyer not found for this user" });

    const buyer = await Buyer.findById(buyerId).populate("staffId");
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // ---- optional snapshot/update of buyer's address from request ----
    if (address || fullAddress || city || state || pincode || country) {
      buyer.shopAddress = {
        line1: fullAddress || address || buyer.shopAddress?.line1 || "",
        city: city || buyer.shopAddress?.city || "",
        state: state || buyer.shopAddress?.state || "",
        postalCode: pincode || buyer.shopAddress?.postalCode || "",
        country: country || buyer.shopAddress?.country || "India",
      };
      await buyer.save();
    }

    // ---- map product lines (DB-backed + ad-hoc) ----
    const withIds = products.filter(p => p.productId && isValidObjectId(String(p.productId)));
    const adHoc   = products.filter(p => !p.productId || !isValidObjectId(String(p.productId)));

    // DB items
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

      // If all selected DB products belong to the same seller, auto-attach it
      const uniqueSellers = [...new Set(prodDocs.map(d => String(d.seller)))];
      if (uniqueSellers.length === 1) sellerIdCandidate = uniqueSellers[0];
    }

    // Ad-hoc items
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

    // ---- totals (ensure INTs) ----
    const totalAmount    = toInt(allItems.reduce((s, x) => s + toNum(x.total || 0), 0));
    const discountAmount = toInt(req.body.discountAmount || 0);
    const gstAmount      = toInt(req.body.gstAmount || 0);
    const finalAmount    = toInt(req.body.finalAmount ?? (totalAmount - discountAmount + gstAmount));

    // ---- brand summary ----
    const brandBreakdown = allItems.reduce((acc, it) => {
      if (!it.brand) return acc;
      const hit = acc.find(b => b.brand === it.brand);
      if (hit) hit.amount = toInt(toNum(hit.amount) + toNum(it.total));
      else acc.push({ brand: it.brand, amount: toInt(it.total) });
      return acc;
    }, []);

    // ---- staff & seller linkage ----
    const resolvedStaffId   = await resolveStaffId(req);     // may be null (buyer placing order)
    const resolvedSellerId  = await resolveSellerId(req);    // may be null
    const staffIdToUse      = buyer.staffId?._id || resolvedStaffId || undefined;
    const staffCodeToUse    = staffCode || buyer.staffCode || buyer.employeeCode || undefined;
    const sellerIdToUse     = sellerIdCandidate || resolvedSellerId || undefined;

    // ---- persist order ----
    const orderDoc = await Order.create({
      buyerId: buyer._id,
      staffId: staffIdToUse,
      staffCode: staffCodeToUse,
      sellerId: sellerIdToUse,

      pincode: buyer.shopAddress?.postalCode || pincode || "",
      city:    buyer.shopAddress?.city       || city    || "",
      state:   buyer.shopAddress?.state      || state   || "",
      country: buyer.shopAddress?.country    || country || "India",
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

/* -----------------------------------
   GET /orders (admin or internal)
------------------------------------*/
exports.getAllOrders = async (_req, res) => {
  try {
    const orders = await Order.find()
      .populate({
        path: "buyerId",
        select: "name phone email shopName shopAddress city state postalCode",
      })
      .populate({
        path: "sellerId",
        select: "brandName gstNumber fullAddress userId",
        populate: {
          path: "userId",
          select: "name email phone", 
        },
      })
      .populate("staffId", "name employeeCode gstNumber")
      .populate("products.product", "productname finalPrice brand")
      .populate("product", "productname finalPrice brand")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, items: orders });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch orders", error: err.message });
  }
};

/* -----------------------------------
   GET /orders/:id
------------------------------------*/
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

/* -----------------------------------
   PATCH /orders/:id/status
   - Validates status
   - Restricts buyer to own order
------------------------------------*/
exports.updateStatus = async (req, res) => {
  try {
    const { status, note, reason } = req.body || {};
    if (!status) return res.status(400).json({ message: "Status is required" });
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Optional: only allow the buyer who owns the order to update (when role=buyer)
    if (req.user?.role === "buyer") {
      const tokenUserId = req.user.id || req.user._id;
      // Resolve the caller's buyerId
      const callerBuyerId = await resolveBuyerId(req);
      if (!callerBuyerId || String(order.buyerId) !== String(callerBuyerId)) {
        return res.status(403).json({ message: "Not allowed to update this order" });
      }
    }

    order.status = status;

    if (status === "returned") {
      if (reason) order.returnReason = reason;
      order.isReturnRequested = true;
    }
    if (status === "cancelled") {
      if (reason) order.returnReason = reason;
      order.isReturnRequested = false;
    }

    order.logs = order.logs || [];
    order.logs.push({
      action: status.toUpperCase(),
      note: note || reason || "",
      by: req.user?.id || req.user?._id,
      at: new Date(),
    });

    await order.save();
    return res.json({ message: `Order marked as ${status}`, order });
  } catch (err) {
    return res.status(500).json({ message: "Failed to update status", error: err.message });
  }
};

/* Shortcuts */
exports.markPacked = (req, res) =>
  exports.updateStatus({ ...req, body: { status: "ready-to-dispatch", note: req.body?.note } }, res);

exports.markDelivered = (req, res) =>
  exports.updateStatus({ ...req, body: { status: "delivered", note: req.body?.note } }, res);
