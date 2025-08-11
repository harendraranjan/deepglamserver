const router = require('express').Router();
const cloudinary = require('../config/cloudinary');

// GET /api/upload/sign?folder=deepglam/buyers
router.get('/sign', (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = req.query.folder || 'deepglam/buyers';

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });
  } catch (e) {
    console.error('Cloudinary sign error:', e);
    res.status(500).json({ message: 'Failed to sign Cloudinary params' });
  }
});

module.exports = router;
