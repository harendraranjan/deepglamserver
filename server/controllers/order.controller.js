// controllers/order.controller.js
const fs = require("fs");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Buyer = require("../models/buyer.model");
const Seller = require("../models/seller.model");
const User = require("../models/user.model"); // <-- for seller phone
const Bill = require("../models/bill.model");
const path = require("path");

const { uploadFile } = require("../config/cloudinary");
const generateBillPDF = require("../utils/generateBillPDF");

exports.placeOrder = async (req, res) => {
  try {
    // 1) Parse products
    let { products } = req.body;
    if (typeof products === "string") {
      try { products = JSON.parse(products); }
      catch { return res.status(400).json({ message: "Invalid products JSON" }); }
    }
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Products must be a non-empty array" });
    }
    // 2) Shipping/body fields
    const {
      buyerId ,
      pincode, city, state, country, fullAddress,
      staffCode,
      gstRate = 5,
      couponAmount = 0,
      shipping = 0,
      roundOff = 0,
      brandBreakdown = {},
      buyerPhone, // optional override
    } = req.body;
    if (!buyerId) return res.status(400).json({ message: "buyerId is required" });

    // 3) Buyer
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });

    // 4) Normalize + enrich items
    const enriched = [];
    for (const p of products) {
      let prodDoc = null;
      if (p.productId || p._id) {
        prodDoc = await Product.findById(p.productId || p._id).lean();
      }
      const sellerId = String(p.sellerId || p.seller || prodDoc?.sellerId || "").trim();
      if (!sellerId) return res.status(400).json({ message: "Each product must have sellerId (or resolvable productId)" });

      enriched.push({
        productId: p.productId || p._id || prodDoc?._id || null,
        sellerId,
        name: p.name || p.productname || prodDoc?.name || "Item",
        hsn: p.hsn || p.hsnCode || prodDoc?.hsn || "",
        quantity: Number(p.quantity ?? p.qty ?? 1),
        price: Number(p.price ?? prodDoc?.price ?? 0),
        discountPercent: Number(p.discountPercent || p.disc || 0),
      });
    }

    // 5) Sellers validate
    const uniqueSellerIds = [...new Set(enriched.map(i => i.sellerId))];
    const sellersMap = {};
    for (const sId of uniqueSellerIds) {
      const sDoc = await Seller.findById(sId);
      if (!sDoc) return res.status(404).json({ message: `Seller not found: ${sId}` });
      sellersMap[sId] = sDoc;
    }

    // 6) Totals
    const subTotal = enriched.reduce((s, i) => s + i.price * i.quantity, 0);
    const lineDisc = enriched.reduce((s, i) => s + ((i.discountPercent || 0) / 100) * (i.price * i.quantity), 0);
    const taxableValue = subTotal - lineDisc;
    const gstAmount = (taxableValue * Number(gstRate)) / 100;
    const finalAmount = taxableValue + gstAmount - Number(couponAmount) + Number(shipping) + Number(roundOff);

    // 7) Create order
    const order = await Order.create({
      buyerId,
      pincode, city, state, country, fullAddress,
      staffCode,
      products: enriched,
      totalAmount: Number(subTotal.toFixed(2)),
      discountAmount: Number(lineDisc.toFixed(2)),
      gstAmount: Number(gstAmount.toFixed(2)),
      finalAmount: Number(finalAmount.toFixed(2)),
      brandBreakdown,
      status: "confirmed",
      paymentStatus: "unpaid",
    });

    // 8) Update buyer due
    await Buyer.findByIdAndUpdate(buyerId, { $inc: { currentDue: order.finalAmount } });

    // 9) Group by seller & create bills
    const bySeller = enriched.reduce((acc, i) => {
      (acc[i.sellerId] ||= []).push(i);
      return acc;
    }, {});
    const bills = [];

    for (const sellerId of Object.keys(bySeller)) {
      const sellerItems = bySeller[sellerId];
      const sellerDoc = sellersMap[sellerId];

      // seller totals & proportional charges
      const sellerSubTotal = sellerItems.reduce((s, i) => s + i.price * i.quantity, 0);
      const sellerLineDisc = sellerItems.reduce((s, i) => s + ((i.discountPercent || 0) / 100) * (i.price * i.quantity), 0);
      const sellerTaxable = sellerSubTotal - sellerLineDisc;

      const proportion = taxableValue > 0 ? sellerTaxable / taxableValue : 1 / Object.keys(bySeller).length;
      const allocCoupon = Number((couponAmount * proportion).toFixed(2));
      const allocShipping = Number((shipping * proportion).toFixed(2));
      const allocRound = Number((roundOff * proportion).toFixed(2));

      const sellerGST = (sellerTaxable * Number(gstRate)) / 100;
      const sellerFinal = sellerTaxable + sellerGST - allocCoupon + allocShipping + allocRound;

      const billNumber = `BILL-${Date.now()}-${sellerId.slice(-4)}`;
      const bill = await Bill.create({
        orderId: order._id,
        buyerId,
        sellerId,
        totalAmount: Number(sellerSubTotal.toFixed(2)),
        discountAmount: Number(sellerLineDisc.toFixed(2)),
        gstAmount: Number(sellerGST.toFixed(2)),
        finalAmount: Number(sellerFinal.toFixed(2)),
        billNumber,
        status: "unpaid",
      });

      // ---- Build company override from Seller.fullAddress (object) + User phone ----
      const sellerAddrObj = sellerDoc?.fullAddress || {};
      const sellerAddressStr = [
        sellerAddrObj.line1,
        sellerAddrObj.line2,
        sellerAddrObj.city,
        sellerAddrObj.state,
        sellerAddrObj.country,
        sellerAddrObj.postalCode
      ].filter(Boolean).join(", ");

      let sellerUser = null;
      if (sellerDoc?.userId) {
        sellerUser = await User.findById(sellerDoc.userId).select("phone mobile").lean();
      }

      const companyOverride = {
        name: sellerDoc?.brandName || "My Brand",
        gstNumber: sellerDoc?.gstNumber || "-",
        phone: sellerUser?.phone || sellerUser?.mobile || "-",
        state: sellerAddrObj.state || "-",
        address: sellerAddressStr || "-"
      };

      // 10) PDF + upload
      const pdfPath = await generateBillPDF(
        bill,
        sellerItems,
        buyer,
        sellerDoc,
        {
          company: companyOverride,
          charges: {
            gstRate: Number(gstRate),
            couponAmount: allocCoupon,
            shipping: allocShipping,
            roundOff: allocRound,
          },
          payment: {
            upi: process.env.PAY_UPI || "glamelia@okhdfcbank",
            accountName: process.env.PAY_ACCOUNT_NAME || "GLAMELIA PRIVATE LIMITED",
            bankName: process.env.PAY_BANK || "HDFC BANK",
            accountNo: process.env.PAY_ACCOUNT_NO || "50200016189590",
            ifsc: process.env.PAY_IFSC || "HDFC0000298",
          },
          // Buyer shipping shown in PDF
          shipping: {
            address: fullAddress,
            city,
            state,
            pincode,
            phone: buyerPhone || buyer?.phone || buyer?.mobile
          },
            logoPath: path.join(__dirname, "..", "public", "deepglam-logo.png")

        }
      );

      const uploadRes = await uploadFile(pdfPath, {
        folder: "deepglam/invoices",
        resource_type: "raw",
      });

      bill.pdfUrl = uploadRes.secure_url;
      await bill.save();

      try { fs.unlinkSync(pdfPath); } catch {}
      bills.push(bill);
    }

    return res.status(201).json({
      message: "Order placed & multiple bills generated",
      order,
      bills,
    });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ message: "Order placement failed", error: err.message });
  }
};


// 📃 Get all orders (admin/seller/staff)
exports.getAllOrders = async (req, res) => {
  try {
    const filters = req.query || {};
    const orders = await Order.find(filters).populate("buyerId sellerId address").sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

// 👤 Get single order
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("buyerId sellerId address products.product");
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

// 🔁 Update Order Status (admin/seller)
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    await order.save();

    res.json({ message: `Order marked as ${status}`, order });
  } catch (err) {
    res.status(500).json({ message: "Status update failed", error: err.message });
  }
};

// 🔁 Request Return
exports.requestReturn = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.isReturnRequested = true;
    order.returnReason = reason;
    order.status = "returned";
    await order.save();

    res.json({ message: "Return requested", order });
  } catch (err) {
    res.status(500).json({ message: "Return request failed", error: err.message });
  }
};

// 💰 Mark Payment Status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.paymentStatus = status;
    await order.save();

    res.json({ message: `Payment marked as ${status}`, order });
  } catch (err) {
    res.status(500).json({ message: "Payment update failed", error: err.message });
  }
};
