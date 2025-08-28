// utils/generateBillPDF.js
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { Readable } = require("stream");

/**
 * Format currency (₹ 12,345)
 */
function inr(n = 0) {
  const x = Number(n) || 0;
  return `₹ ${x.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Draw a table-like row
 */
function drawRow(doc, y, cols, widths, opts = {}) {
  const { bold = false, size = 10, color = "#111", padX = 6, padY = 6 } = opts;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
  let x = doc.page.margins.left;
  cols.forEach((text, i) => {
    const w = widths[i];
    doc.text(String(text ?? ""), x + padX, y + padY, { width: w - padX * 2 });
    x += w;
  });
}

/**
 * Convert a DataURL/Base64 into a Buffer (for embedding QR)
 */
function dataURLToBuffer(dataUrl) {
  const base64 = (dataUrl || "").split(",")[1] || "";
  return Buffer.from(base64, "base64");
}

/**
 * Generate a QR buffer from a string (UPI/Paytm QR payload)
 */
async function generateQRBuffer(qrString) {
  if (!qrString) return null;
  const dataUrl = await QRCode.toDataURL(qrString, { margin: 1, scale: 6 });
  return dataURLToBuffer(dataUrl);
}

/**
 * Add optional PAID watermark
 */
function drawPaidWatermark(doc) {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.rotate(-30, { origin: [cx, cy] });
  doc.font("Helvetica-Bold").fontSize(96).fillColor("#18a558").opacity(0.12);
  const text = "PAID";
  const w = doc.widthOfString(text);
  const h = doc.currentLineHeight();
  doc.text(text, cx - w / 2, cy - h / 2);
  doc.opacity(1).restore();
}

/**
 * Create the invoice PDF and return a Buffer
 *
 * @param {Object} meta  { billNumber?, orderId?, date? }
 * @param {Array}  items Array<{ name, qty, price, total }>, OR order.products lines
 * @param {Object} buyer Populated buyer: { name, phone, email, shopName }
 * @param {Object} seller Populated seller: { brandName, gstNumber }
 * @param {Object} opts
 *   opts.shipping  { address, city, state, pincode, country }
 *   opts.charges   { totalAmount, discountAmount, gstAmount, finalAmount, gstRate?, shipping?, roundOff? }
 *   opts.payment   { qrString?, upi?, status? }  // status === "paid" → watermark
 *   opts.company   { legalName?, gstNumber? }
 *
 * @returns Buffer
 */
async function generateBillPDF(meta = {}, items = [], buyer = {}, seller = {}, opts = {}) {
  const {
    billNumber = `INV-${Date.now()}`,
    orderId,
    date = new Date(),
  } = meta;

  const shipping = opts.shipping || {};
  const charges = opts.charges || {};
  const payment = opts.payment || {};
  const company = opts.company || {};

  // Normalise line items from either {name,qty,price,total} OR order.products
  const lines = (items || []).map((li, idx) => {
    // handle both shapes: {name/qty/price/total} OR {product: {...}, quantity, price, total}
    const p = li.product || {};
    const name =
      li.name ||
      p.productname ||
      p.name ||
      p.title ||
      `Item ${idx + 1}`;
    const qty = Number(li.qty ?? li.quantity ?? 1);
    const price = Number(li.price ?? p.finalPrice ?? p.mrp ?? 0);
    const total = Number(li.total ?? qty * price);
    return { sn: idx + 1, name, qty, price, total };
  });

  // Pre-generate QR (Paytm/UPI) if provided
  const qrBuf = await generateQRBuffer(payment.qrString || payment.upi);

  // Create PDF
  const doc = new PDFDocument({
    size: "A4",
    margin: 36, // 0.5"
    info: {
      Title: billNumber,
      Author: company.legalName || seller.brandName || "Invoice",
    },
  });

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));
  const outPromise = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  /* ---------------- Header ---------------- */
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111");
  doc.text(company.legalName || seller.brandName || "Company", { continued: false });

  doc.font("Helvetica").fontSize(10).fillColor("#333");
  if (company.gstNumber || seller.gstNumber) {
    doc.text(`GSTIN: ${company.gstNumber || seller.gstNumber}`);
  }
  doc.moveDown(0.6);
  doc.lineWidth(1).strokeColor("#eee").moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);

  // Invoice meta (left block)
  const leftX = doc.page.margins.left;
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text("TAX INVOICE", leftX, y);
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  doc.text(`Invoice No: ${billNumber}`);
  doc.text(`Order ID: ${orderId || "-"}`);
  doc.text(`Date: ${new Date(date).toLocaleString()}`);
  const afterMetaY = doc.y;

  // Payment QR (right block)
  const rightBoxW = 180;
  const rightX = doc.page.width - doc.page.margins.right - rightBoxW;
  doc.rect(rightX, y - 18, rightBoxW, 120).strokeColor("#eee").stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text("Scan to Pay", rightX + 8, y - 14);
  if (qrBuf) {
    doc.image(qrBuf, rightX + 8, y + 4, { fit: [rightBoxW - 16, rightBoxW - 16] });
  } else {
    doc.font("Helvetica").fontSize(9).fillColor("#999").text("QR unavailable", rightX + 8, y + 24);
  }

  // Paid watermark (optional)
  if (String(payment.status).toLowerCase() === "paid") {
    drawPaidWatermark(doc);
  }

  doc.moveTo(leftX, Math.max(afterMetaY, y + 120) + 10);
  doc.lineTo(doc.page.width - doc.page.margins.right, Math.max(afterMetaY, y + 120) + 10).strokeColor("#eee").stroke();
  doc.moveDown(0.4);

  /* ---------------- Parties & Shipping ---------------- */
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;

  // Bill To (Buyer)
  let blockY = doc.y + 6;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111").text("Bill To", leftX, blockY);
  blockY = doc.y + 2;
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  doc.text(buyer?.shopName || buyer?.name || "-", leftX, blockY, { width: colW });
  if (buyer?.phone) doc.text(`Phone: ${buyer.phone}`, leftX, doc.y, { width: colW });
  if (buyer?.email) doc.text(`Email: ${buyer.email}`, leftX, doc.y, { width: colW });

  // Ship To (snapshot)
  const shipX = leftX + colW + 20;
  let shipY = (doc.y = (doc._y || blockY));
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111").text("Ship To", shipX, shipY);
  shipY = doc.y + 2;
  const addrLines = [
    shipping.address,
    [shipping.city, shipping.state, shipping.pincode].filter(Boolean).join(", "),
    shipping.country || "India",
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  addrLines.forEach((line) => doc.text(line, shipX, doc.y, { width: colW }));

  doc.moveDown(0.6);
  doc.lineWidth(1).strokeColor("#eee").moveTo(leftX, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);

  /* ---------------- Items Table ---------------- */
  const tableY = doc.y;
  const widths = [40, 270, 70, 90, 90]; // SN, Item, Qty, Price, Total
  const header = ["SN", "Item", "Qty", "Price", "Amount"];

  drawRow(doc, tableY, header, widths, { bold: true, size: 10 });
  let rowY = tableY + 22;

  lines.forEach((li) => {
    if (rowY > doc.page.height - 150) {
      doc.addPage();
      rowY = doc.y;
      drawRow(doc, rowY, header, widths, { bold: true, size: 10 });
      rowY += 22;
    }
    drawRow(doc, rowY, [li.sn, li.name, li.qty, inr(li.price), inr(li.total)], widths, {
      size: 10,
      color: "#222",
    });
    rowY += 20;
  });

  // Table bottom border
  doc.moveTo(leftX, rowY + 4).lineTo(doc.page.width - doc.page.margins.right, rowY + 4).strokeColor("#eee").stroke();

  /* ---------------- Totals ---------------- */
  const rightColX = doc.page.width - doc.page.margins.right - 250;
  let tY = rowY + 18;

  const totalAmount = Number(charges.totalAmount || 0);
  const discountAmount = Number(charges.discountAmount || 0);
  const gstAmount = Number(charges.gstAmount || 0);
  const shippingAmt = Number(charges.shipping || 0);
  const roundOff = Number(charges.roundOff || 0);
  const finalAmount =
    charges.finalAmount != null
      ? Number(charges.finalAmount)
      : Math.max(totalAmount - discountAmount + gstAmount + shippingAmt + roundOff, 0);

  const totalLines = [
    ["Subtotal", inr(totalAmount)],
    ["Discount", `- ${inr(discountAmount)}`],
    ["GST", inr(gstAmount)],
  ];
  if (shippingAmt) totalLines.push(["Shipping", inr(shippingAmt)]);
  if (roundOff) totalLines.push(["Round Off", inr(roundOff)]);
  totalLines.push(["Grand Total", inr(finalAmount)]);

  totalLines.forEach(([k, v], i) => {
    const isGrand = i === totalLines.length - 1;
    doc.font(isGrand ? "Helvetica-Bold" : "Helvetica").fontSize(isGrand ? 12 : 10);
    doc.fillColor(isGrand ? "#111" : "#333").text(k, rightColX, tY, { width: 140, align: "right" });
    doc.text(v, rightColX + 150, tY, { width: 100, align: "right" });
    tY += isGrand ? 18 : 14;
  });

  /* ---------------- Footer ---------------- */
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9).fillColor("#666");
  doc.text("Thank you for your business!", leftX, doc.y);
  if (payment.upi && !qrBuf) {
    doc.text(`UPI: ${payment.upi}`, leftX, doc.y + 2);
  }

  doc.end();
  return outPromise;
}

/**
 * Helper: write invoice to a file (returns absolute path)
 */
async function generateBillPDFToFile(path, ...args) {
  const buf = await generateBillPDF(...args);
  const fs = require("fs");
  await fs.promises.writeFile(path, buf);
  return path;
}

module.exports = {
  generateBillPDF,
  generateBillPDFToFile,
};
