// utils/generateBillPDF.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const sharp = require("sharp");
const { toWords } = require("number-to-words");

// ---------- helpers ----------
const money = (n = 0) => Number(n || 0).toFixed(2);
const join = (arr = []) => arr.filter(Boolean).join(", ");
const pad = (str, len) =>
  (String(str ?? "").length > len ? String(str).slice(0, len - 1) + "…" : String(str));
const stringifyAddress = (addr) => {
  if (!addr) return "-";
  if (typeof addr === "string") return addr;
  if (typeof addr === "object")
    return join([addr.line1, addr.line2, addr.city, addr.state, addr.country, addr.postalCode]);
  return String(addr);
};
const gstSplit = ({ taxableValue, gstRate, sameState }) => {
  const totalGST = (taxableValue * gstRate) / 100;
  if (sameState) return { cgst: totalGST / 2, sgst: totalGST / 2, igst: 0, gstAmount: totalGST };
  return { cgst: 0, sgst: 0, igst: totalGST, gstAmount: totalGST };
};

// Convert any logo file to a temporary PNG that PDFKit accepts
async function ensurePng(inputPath) {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) return null;
    const out = path.join(os.tmpdir(), `logo-${Date.now()}.png`);
    await sharp(inputPath).png().toFile(out);
    return out;
  } catch {
    return null;
  }
}

async function generateBillPDF(bill, itemsArg, buyer, seller, opts = {}) {
  const items = Array.isArray(itemsArg) ? itemsArg : itemsArg?.products;
  if (!Array.isArray(items)) throw new Error("generateBillPDF: items must be an array");

  // palette
  const COLOR_PRIMARY = "#0b1d4d";
  const COLOR_ACCENT  = "#f26a21";
  const COLOR_SOFT    = "#f3f4f6";
  const COLOR_MUTED   = "#6b7280";

  // buyer (with shipping overrides)
  const ship = opts.shipping || {};
  const buyerInfo = {
    name: buyer?.name || buyer?.fullName || "-",
    gstNumber: buyer?.gstNumber || "-",
    state: ship.state || buyer?.state || "-",
    city: ship.city || buyer?.city || "-",
    pincode: ship.pincode || buyer?.pincode || buyer?.pin || "-",
    address: stringifyAddress(ship.address || buyer?.address || buyer?.fullAddress),
    phone: ship.phone || buyer?.phone || buyer?.mobile || buyer?.contactNumber || "-",
  };

  // seller/company (used for cards)
  const company = {
    gstNumber: opts.company?.gstNumber || seller?.gstNumber || "-",
    phone: opts.company?.phone || seller?.phone || seller?.mobile || "-",
    state: opts.company?.state || seller?.state || seller?.fullAddress?.state || "-",
    address: opts.company?.address || stringifyAddress(seller?.fullAddress || seller?.address),
  };

  // payments + charges
  const payment = {
    upi: opts.payment?.upi || "glamelia@okhdfcbank",
    accountName: opts.payment?.accountName || "GLAMELIA PRIVATE LIMITED",
    bankName: opts.payment?.bankName || "HDFC BANK",
    accountNo: opts.payment?.accountNo || "50200016189590",
    ifsc: opts.payment?.ifsc || "HDFC0000298",
  };
  const charges = {
    couponAmount: Number(opts.charges?.couponAmount || 0),
    shipping: Number(opts.charges?.shipping || 0),
    roundOff: Number(opts.charges?.roundOff || 0),
    gstRate: Number(opts.charges?.gstRate ?? 5),
  };
  const sameState =
    String(buyerInfo.state || "").toLowerCase() === String(company.state || "").toLowerCase();

  // rows
  const rows = items.map((it, i) => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const price = Number(it.price ?? it.unitPrice ?? 0);
    const disc = Number(it.discountPercent || 0);
    const total = price * qty;
    const taxable = total - (disc / 100) * total;
    return {
      sr: i + 1,
      name: it.name || it.productname || it.title || "Item",
      hsn: it.hsn || it.hsnCode || "",
      qty,
      price,
      total,
      discountPercent: disc,
      amount: taxable,
    };
  });

  const subTotal = rows.reduce((s, r) => s + r.total, 0);
  const taxableValue = rows.reduce((s, r) => s + r.amount, 0);
  const gst = gstSplit({ taxableValue, gstRate: charges.gstRate, sameState });
  const grandBeforeAdj = taxableValue + gst.gstAmount;
  const grandTotal = grandBeforeAdj - charges.couponAmount + charges.shipping + charges.roundOff;

  // pdf setup
  const invoiceDir = path.join(__dirname, "../invoices");
  if (!fs.existsSync(invoiceDir)) fs.mkdirSync(invoiceDir, { recursive: true });
  const pdfPath = path.join(invoiceDir, `${bill.billNumber}.pdf`);

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  const ws = fs.createWriteStream(pdfPath);
  doc.pipe(ws);

  const drawHr = (y, color = COLOR_SOFT) =>
    doc.save().strokeColor(color).moveTo(36, y).lineTo(559, y).stroke().restore();
  const box = (x, y, w, h, stroke = COLOR_SOFT, fill) => {
    doc.save();
    if (fill) { doc.rect(x, y, w, h).fill(fill); doc.fillColor("black"); }
    doc.strokeColor(stroke).lineWidth(0.7).rect(x, y, w, h).stroke();
    doc.restore();
  };

  // ===== HEADER (logo left, meta right) =====
  const headerY = 36;
  let metaStartX = 36;
  let headerBlockH = 56;           // min header height (no logo)
  const LOGO_W = 150;
  const LOGO_H = 62;               // used to reserve space so nothing overlaps

  // (A) Logo top-left
  try {
    if (opts.logoPath) {
      const logoPng = await ensurePng(opts.logoPath);
      if (logoPng && fs.existsSync(logoPng)) {
        doc.image(logoPng, 36, headerY - 35, { width: LOGO_W });
        metaStartX = 36 + LOGO_W + 16;        // meta starts to right of logo
        headerBlockH = Math.max(headerBlockH, LOGO_H + 6); // reserve enough vertical space
      }
    }
  } catch {}

// ---- constants for inner page edges ----
const PAGE_LEFT  = 36;
const PAGE_RIGHT = 559; // A4 width 595 - left/right margin 36

// (B) Invoice metadata (right side, independent of logo)
const INFO_W = 220;                 // width of the text box
const infoX  = PAGE_RIGHT - INFO_W; // start X so that box hugs the right edge
const infoY  = 36;                  // top Y (adjust if you want)

doc.fontSize(10).font("Helvetica").fillColor(COLOR_PRIMARY);
doc.text(`Invoice No: ${bill.billNumber}`, infoX, infoY,        { width: INFO_W, align: "right" });
doc.text(`Date: ${new Date().toLocaleDateString()}`, infoX, infoY + 14, { width: INFO_W, align: "right" });
doc.text(`Order No: ${bill.orderId || "-"}`,        infoX, infoY + 28, { width: INFO_W, align: "right" });

// draw separator after the *dynamic* header height
const hrY = headerY + headerBlockH; // keep this line as is
drawHr(hrY);

  // ===== DISPATCHED FROM & BUYER cards (start AFTER header area) =====
  const cardTop = hrY + 14;                     // pushed down to avoid overlapping logo
  const colW = (559 - 36) / 2 - 4;
  const leftX = 36, rightX = 36 + colW + 8, innerPad = 8;

  const sellerTitle = "DISPATCHED FROM";
  const sellerLines =
    `GSTIN: ${company.gstNumber}\nPhone: ${company.phone}\nAddress: ${company.address}`;

  const buyerTitle  = "BUYER (BILL TO / SHIP TO)";
  const buyerLines  =
    `${buyerInfo.name}\nGSTIN: ${buyerInfo.gstNumber}\nPhone: ${buyerInfo.phone}\nAddress: ${buyerInfo.address}`;

  doc.font("Helvetica-Bold").fontSize(11);
  const sellerTitleH = doc.heightOfString(sellerTitle, { width: colW - 2 * innerPad });
  const buyerTitleH  = doc.heightOfString(buyerTitle,  { width: colW - 2 * innerPad });
  doc.font("Helvetica").fontSize(10);
  const sellerBodyH  = doc.heightOfString(sellerLines, { width: colW - 2 * innerPad });
  const buyerBodyH   = doc.heightOfString(buyerLines,  { width: colW - 2 * innerPad });
  const gap = 6;
  const boxH = Math.max(
    sellerTitleH + gap + sellerBodyH,
    buyerTitleH + gap + buyerBodyH
  ) + 2 * innerPad;

  box(leftX,  cardTop, colW, boxH);
  box(rightX, cardTop, colW, boxH);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY)
     .text(sellerTitle, leftX + innerPad, cardTop + innerPad, { width: colW - 2 * innerPad });
  doc.font("Helvetica").fontSize(10).fillColor("black")
     .text(sellerLines, leftX + innerPad, cardTop + innerPad + sellerTitleH + gap, { width: colW - 2 * innerPad });

  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY)
     .text(buyerTitle, rightX + innerPad, cardTop + innerPad, { width: colW - 2 * innerPad });
  doc.font("Helvetica").fontSize(10).fillColor("black")
     .text(buyerLines, rightX + innerPad, cardTop + innerPad + buyerTitleH + gap, { width: colW - 2 * innerPad });

  // ===== Items table =====
  let tableTop = cardTop + boxH + 20;
  const tX = 36, tW = 523;
  const cols = [
    { key: "sr", label: "Sr", width: 28, align: "center" },
    { key: "name", label: "Item", width: 210, align: "left" },
    { key: "hsn", label: "HSN", width: 52, align: "center" },
    { key: "qty", label: "Qty", width: 40, align: "right" },
    { key: "price", label: "Price", width: 60, align: "right" },
    { key: "total", label: "Total", width: 58, align: "right" },
    { key: "discountPercent", label: "Disc %", width: 45, align: "right" },
    { key: "amount", label: "Amount", width: 70, align: "right" }
  ];

  box(tX, tableTop, tW, 22, COLOR_SOFT, COLOR_SOFT);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_PRIMARY);
  let cx = tX + 6;
  cols.forEach(c => { doc.text(c.label, cx, tableTop + 6, { width: c.width - 12, align: c.align }); cx += c.width; });
  doc.fillColor("black").font("Helvetica");
  let y = tableTop + 22;
  const rowHeight = 20, maxY = 770;

  const drawRow = (r, i) => {
    if (i % 2 === 0) { doc.save().fillColor(COLOR_SOFT).rect(tX, y, tW, rowHeight).fill().restore(); }
    doc.save().strokeColor(COLOR_SOFT).lineWidth(0.5).rect(tX, y, tW, rowHeight).stroke().restore();
    let cx2 = tX + 6;
    const cells = {
      sr: r.sr,
      name: pad(r.name, 48),
      hsn: r.hsn || "-",
      qty: String(r.qty),
      price: money(r.price),
      total: money(r.total),
      discountPercent: r.discountPercent ? money(r.discountPercent) : "0.00",
      amount: money(r.amount),
    };
    cols.forEach(c => { doc.text(cells[c.key], cx2, y + 5, { width: c.width - 12, align: c.align }); cx2 += c.width; });
    y += rowHeight;
  };

  rows.forEach((r, i) => {
    if (y + rowHeight > maxY) {
      doc.addPage();
      y = 60;
      box(tX, y, tW, 22, COLOR_SOFT, COLOR_SOFT);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_PRIMARY);
      let cx3 = tX + 6;
      cols.forEach(c => { doc.text(c.label, cx3, y + 6, { width: c.width - 12, align: c.align }); cx3 += c.width; });
      doc.fillColor("black").font("Helvetica");
      y += 22;
    }
    drawRow(r, i);
  });

  // ===== Summary / GST =====
  y += 8;
  const panelX = 36, panelW = 350;
  const gstX = 398, gstW = 161;

  box(panelX, y, panelW, 86);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY).text("Summary", panelX + 8, y + 6);
  doc.font("Helvetica").fontSize(10).fillColor("black")
    .text(`Sub Total: ₹${money(subTotal)}`, panelX + 8, y + 26)
    .text(`Discount (Products): Included`, panelX + 8, y + 42)
    .text(`Taxable Value: ₹${money(taxableValue)}`, panelX + 8, y + 58);

  box(gstX, y, gstW, 120);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY).text("Taxes & Adjustments", gstX + 8, y + 6);
  doc.font("Helvetica").fontSize(10).fillColor("black");
  let gy = y + 26;
  if (sameState) {
    doc.text(`CGST (${charges.gstRate / 2}%):  ₹${money(gst.cgst)}`, gstX + 8, gy); gy += 16;
    doc.text(`SGST (${charges.gstRate / 2}%):  ₹${money(gst.sgst)}`, gstX + 8, gy); gy += 16;
  } else {
    doc.text(`IGST (${charges.gstRate}%):  ₹${money(gst.igst)}`, gstX + 8, gy); gy += 16;
  }
  doc.text(`Coupon:  -₹${money(charges.couponAmount)}`, gstX + 8, gy); gy += 16;
  doc.text(`Shipping:  ₹${money(charges.shipping)}`, gstX + 8, gy); gy += 16;
  doc.text(`Round Off:  ₹${money(charges.roundOff)}`, gstX + 8, gy); gy += 16;

  const gtY = Math.max(y + 92, gy + 6);
  box(gstX, gtY, gstW, 30, COLOR_ACCENT, COLOR_ACCENT);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("white").text(`Grand Total: ₹${money(grandTotal)}`, gstX + 8, gtY + 8);

  const words = `${toWords(Math.round(grandTotal))} rupees only`;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_PRIMARY).text("Amount in words:", panelX, gtY + 40);
  doc.font("Helvetica").fontSize(10).fillColor("black").text(words, panelX, gtY + 56, { width: 360 });

  // ===== QR + Bank + Signatures =====
  const payY = gtY + 96;
  const upiString = opts.payment?.qrString ||
    `upi://pay?pa=${encodeURIComponent(payment.upi)}&pn=${encodeURIComponent(payment.accountName)}&am=${money(grandTotal)}&cu=INR&tn=${encodeURIComponent(bill.billNumber)}`;
  const qrBuffer = await QRCode.toBuffer(upiString, { margin: 1, width: 140 });

  box(36, payY, 150, 160);
  doc.image(qrBuffer, 46, payY + 12, { width: 120 });
  doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text("Scan to Pay (UPI)", 36, payY + 130, { width: 150, align: "center" });

  box(196, payY, 363, 160);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY).text("Bank Details", 204, payY + 10);
  doc.font("Helvetica").fontSize(10).fillColor("black")
    .text(`Account Name: ${payment.accountName}`, 204, payY + 28)
    .text(`Bank: ${payment.bankName}`, 204, payY + 44)
    .text(`Account No: ${payment.accountNo}`, 204, payY + 60)
    .text(`IFSC: ${payment.ifsc}`, 204, payY + 76)
    .text(`UPI: ${payment.upi}`, 204, payY + 92);

  const sigY = payY + 120;
  // signature lines + labels
  doc.moveTo(204, sigY).lineTo(360, sigY).strokeColor(COLOR_SOFT).stroke();
  doc.moveTo(370, sigY).lineTo(550, sigY).strokeColor(COLOR_SOFT).stroke();
  doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED)
    .text("Receiver's Signature", 204, sigY + 6)
    .text("Authorized Signature", 370, sigY + 6);

  // ===== Glamella block BELOW Authorized Signature (pushed further down) =====
  const infoStartY = sigY + 40;  // was +26 earlier; now lower to avoid crowding
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_PRIMARY)
     .text("Glamella Private Limited", 370, infoStartY, { width: 180 });
  doc.font("Helvetica").fontSize(10).fillColor("black")
     .text("119/509 A, First Floor Darshan Purwa,", 370, infoStartY + 16, { width: 180 })
     .text("Kalpi road Kanpur(UP -208012",         370, infoStartY + 30, { width: 180 })
     .text("GSTIN/ UIN: 09AALCG6951G1Z7",         370, infoStartY + 46, { width: 180 });

  // Footer
  const footerY = payY + 170;
  doc.save().strokeColor(COLOR_SOFT).moveTo(36, footerY).lineTo(559, footerY).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_PRIMARY).text("Terms & Notes", 36, footerY + 8);
  doc.font("Helvetica").fontSize(9).fillColor("black")
    .text("1) Goods once sold will not be taken back or exchanged.", 36, footerY + 24, { width: 520 })
    .text("2) Interest @18% p.a. will be charged if payment is delayed.", 36, footerY + 36, { width: 520 })
    .text("3) Subject to seller’s jurisdiction.", 36, footerY + 48, { width: 520 });

  doc.font("Helvetica").fontSize(8).fillColor(COLOR_MUTED)
    .text(`Generated on ${new Date().toLocaleString()}`, 36, 810, { width: 523, align: "right" });

  doc.end();
  await new Promise((res, rej) => { ws.on("finish", res); ws.on("error", rej); });
  return pdfPath;
}

module.exports = generateBillPDF;
