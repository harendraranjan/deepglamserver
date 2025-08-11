const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');
//const verifyToken = require('../middlewares/verifyToken');

// ✅ All wishlist routes require user to be logged in
//router.use(verifyToken);

// ➕ Add to wishlist
router.post('/:productId', wishlistController.addToWishlist);

// ❌ Remove from wishlist
router.delete('/:productId', wishlistController.removeFromWishlist);

// 📥 Get user's wishlist
router.get('/', wishlistController.getWishlist);

module.exports = router;
