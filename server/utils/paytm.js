//server/utils/paytm.js
const axios = require("axios");
const PaytmChecksum = require("paytmchecksum");

const isProd = process.env.PAYTM_ENV === "production";
const BASE = isProd ? "https://securegw.paytm.in" : "https://securegw-stage.paytm.in";

// Create Dynamic QR for an invoice
exports.createDynamicQR = async ({ orderId, amountPaise }) => {
  // Paytm expects amount in rupees as string (two decimals). Convert paise → rupees
  const amountRupees = (Number(amountPaise || 0) / 100).toFixed(2);

  const body = {
    mid: process.env.PAYTM_MID,
    orderId,                              // we map to invoice.number
    amount: amountRupees,
    businessType: "UPI_QR_CODE",
    posId: process.env.PAYTM_POS_ID || "DG_POS_01",
  };

  const signature = await PaytmChecksum.generateSignature(
    JSON.stringify(body),
    process.env.PAYTM_MERCHANT_KEY
  );

  const payload = {
    body,
    head: {
      clientId: process.env.PAYTM_CLIENT_ID || "DG",
      version: "v1",
      signature,
    },
  };

  const { data } = await axios.post(`${BASE}/paymentservices/qr/create`, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });

  const ok = data?.body?.resultInfo?.resultStatus === "SUCCESS";
  if (!ok) {
    const msg = data?.body?.resultInfo?.resultMsg || "QR create failed";
    const code = data?.body?.resultInfo?.resultCode || "ERR";
    throw new Error(`${code} ${msg}`);
  }

  // Response contains qrCodeId, qrData, image(base64)
  return {
    qrCodeId: data.body.qrCodeId,
    qrData: data.body.qrData,
    qrImageB64: data.body.image,
  };
};

// Verify Paytm checksum on webhook (form or json)
exports.verifyChecksum = async (obj) => {
  const received = obj.CHECKSUMHASH || obj.checksumhash || obj.signature;
  const payload = { ...obj };
  delete payload.CHECKSUMHASH; delete payload.checksumhash; delete payload.signature;

  return PaytmChecksum.verifySignature(
    payload,
    process.env.PAYTM_MERCHANT_KEY,
    received
  );
};
