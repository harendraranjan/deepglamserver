// server/controllers/payment.controller.paytm.js
const Invoice = require("../models/invoice.model");
const Payment = require("../models/payment.model");
const { createDynamicQR } = require("../utils/paytm");

// Init: generate Paytm Dynamic QR for an invoice (unpaid)
exports.initPaytmForInvoice = async (req, res) => {
  const { invoiceId } = req.params;
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (invoice.status === "paid")
    return res.json({ ok: true, message: "Already paid", invoice });

  const amountPaise = invoice.balanceDuePaise || invoice.grandTotalPaise;

  // Map your invoice.number to Paytm orderId
  const qr = await createDynamicQR({
    orderId: invoice.number,
    amountPaise,
  });

  // Persist QR on invoice for PDF/UI
  invoice.paytm = {
    qrCodeId: qr.qrCodeId,
    qrData: qr.qrData,
    qrImageB64: qr.qrImageB64,
  };
  await invoice.save();

  // Create a 'created' Payment (idempotency via idempotencyKey = orderId)
  await Payment.findOneAndUpdate(
    { idempotencyKey: invoice.number },
    {
      $setOnInsert: {
        invoiceId: invoice._id,
        orderId: invoice.orderId,
        buyerId: invoice.buyerId,
        gateway: "paytm",
        amountPaise,
        status: "created",
        pg_order_id: invoice.number,
      },
    },
    { upsert: true, new: true }
  );

  res.json({
    ok: true,
    invoice: { id: invoice._id, number: invoice.number, status: invoice.status },
    paytm: { qrImageB64: qr.qrImageB64, qrCodeId: qr.qrCodeId },
  });
};
