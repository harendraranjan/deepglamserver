/*const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;*/
/*const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload local file to Cloudinary
 * @param {string} filePath
 * @param {object} options
 * @returns {Promise<{secure_url: string, public_id: string}>}
 *//*
async function uploadFile(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        resource_type: options.resource_type || 'auto',
        folder: options.folder || 'buyers',
        use_filename: true,
        unique_filename: false,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
  });
}

module.exports = { cloudinary, uploadFile };
*/

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // ✅ variable ka naam
  api_key: process.env.CLOUDINARY_API_KEY,       // ✅ variable ka naam
  api_secret: process.env.CLOUDINARY_API_SECRET, // ✅ variable ka naam
  secure: true,
});

module.exports = cloudinary;
