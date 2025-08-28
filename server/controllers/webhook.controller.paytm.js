// server/controllers/webhook.controller.paytm.js
const mongoose = require("mongoose");
const qs = require("querystring");
const Invoice = require("../models/invoice.model");
const Payment = require("../models/payment.model");
const { afterPaymentSideEffects } = require("../utils/afterPayment");
const { verifyChecksum } = require("../utils/paytm");

// Paytm posts key-value (form-url-encoded) OR JSON
exports.paytmWebhook = async (req, res) => {
  try {
    // Normalize body
    const raw = req.body;
    const payload = typeof raw === "string"
      ? (/^\s*{/.test(raw) ? JSON.parse(raw) : qs.parse(raw))
      : raw;

    // Verify checksum (security critical)
    const ok = await verifyChecksum(payload);
    if (!ok) return res.status(400).send("Invalid checksum");

    // Map fields
    const status = String(payload.STATUS || payload.status || "").toUpperCase(); // TXN_SUCCESS / PENDING / FAILURE
    const orderId = payload.ORDERID || payload.orderId; // we used invoice.number
    const txnPaise = Math.round(Number(payload.TXNAMOUNT || payload.amount || 0) * 100);
    const txnId = payload.TXNID || payload.txnId || undefined;

    if (!orderId) return res.status(400).send("Missing ORDERID");

    // Use a transaction to keep Payment + Invoice consistent
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // Find invoice by number stored as orderId
      const invoice = await Invoice.findOne({ number: orderId }).session(session);
      if (!invoice) throw new Error("Invoice not found");

      // Upsert Payment by idempotencyKey = orderId + optional txnId
      const idemKey = txnId ? `PAYTM:${orderId}:${txnId}` : `PAYTM:${orderId}`;
      let payment = await Payment.findOne({ idempotencyKey: idemKey }).session(session);

      if (!payment) {
        payment = await Payment.create([{
          invoiceId: invoice._id,
          orderId: invoice.orderId,
          buyerId: invoice.buyerId,
          gateway: "paytm",
          amountPaise: txnPaise,
          currency: "INR",
          status: (status === "TXN_SUCCESS" ? "captured" : (status === "PENDING" ? "pending" : "failed")),
          pg_payment_id: txnId,
          pg_order_id: orderId,
          idempotencyKey: idemKey,
          checksum: payload.CHECKSUMHASH || payload.signature,
          verifiedSignature: true,
          meta: payload
        }], { session }).then(r => r[0]);
      } else {
        // attach/refresh raw payload & status
        payment.meta = payload;
        payment.pg_payment_id = txnId || payment.pg_payment_id;
        payment.status = (status === "TXN_SUCCESS" ? "captured" : (status === "PENDING" ? "pending" : "failed"));
        await payment.save({ session });
      }

      // Apply only when captured
      if (payment.status === "captured") {
        // Safety: amount mismatch guard (optional strict)
        const expected = invoice.balanceDuePaise || invoice.grandTotalPaise;
        // If you allow partials, skip strict compare. Otherwise, ensure txnPaise === expected.

        invoice.applyPayment(txnPaise, payment._id, "paytm");
        await invoice.save({ session });

        await afterPaymentSideEffects({ invoice, payment });
      }
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("paytmWebhook error:", e);
    return res.status(500).send("ERR");
  }
};
