const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;

/* ---------------- Ensure uploads dir ---------------- */
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

/* ---------------- Multer for images ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only jpg, jpeg, png files allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/* ---------------- Cloudinary Config (for invoices/raw) ---------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ---------------- Buffer → Cloudinary ---------------- */
function uploadRawBufferToCloudinary(
  buffer,
  { publicId, folder = "invoices", overwrite = true }
) {
  return new Promise((resolve, reject) => {
    const opts = {
      resource_type: "raw", // raw = PDF, docs, etc
      overwrite,
      folder,
    };
    if (publicId) opts.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result); // { secure_url, public_id, ... }
    });

    Readable.from(buffer).pipe(stream);
  });
}

/* ---------------- Local Fallback (save PDFs in /uploads/invoices) ---------------- */
function saveBufferLocally(buffer, filename, folder = "invoices") {
  const dir = path.join(uploadDir, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${filename}.pdf`);
  fs.writeFileSync(filePath, buffer);

  return { url: `/uploads/${folder}/${filename}.pdf`, filePath };
}

/* ---------------- Exports ---------------- */
module.exports = {
  upload, // Multer for images
  uploadRawBufferToCloudinary,
  saveBufferLocally,
};
