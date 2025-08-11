/*const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;*/
// server/config/cloudinary.js
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Read env (supports CLOUDINARY_URL or explicit keys)
const hasCloudinary =
  !!process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  console.warn('⚠️ Cloudinary not fully configured. Using local uploads at /uploads.');
}

/**
 * Upload a local file path to Cloudinary (or copy to /uploads if not configured)
 * @param {string} filePath - absolute or relative path to local file
 * @param {object} options - Cloudinary options (e.g., { folder, resource_type })
 * @returns {Promise<{ secure_url: string, public_id?: string }>}
 */
async function uploadFile(filePath, options = {}) {
  if (!filePath) throw new Error('uploadFile: filePath is required');

  if (!hasCloudinary) {
    // Fallback: copy to local /uploads and return a "local URL"
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = path.basename(filePath);
    const dest = path.join(uploadsDir, filename);
    fs.copyFileSync(filePath, dest);

    // Return a path you can serve statically (make sure you serve /uploads in server.js)
    return {
      secure_url: `/uploads/${filename}`,
      public_id: `local_${filename}`,
    };
  }

  // Cloudinary upload
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        resource_type: options.resource_type || 'auto', // use 'raw' for PDFs
        folder: options.folder || undefined,
        use_filename: true,
        unique_filename: false,
        overwrite: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
  });
}

/**
 * Optional: delete by public_id
 */
async function deleteFile(public_id, resource_type = 'image') {
  if (!hasCloudinary) return { result: 'ok' };
  return cloudinary.uploader.destroy(public_id, { resource_type });
}

module.exports = {
  cloudinary,
  uploadFile,   // << named export
  deleteFile,
};
