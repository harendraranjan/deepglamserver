// 📁 server/controllers/wishlist.controller.js
const Wishlist = require('../models/wishlist.model');
const Product = require('../models/product.model');

// 📥 GET wishlist (with full metadata)
exports.getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate('products.product');

    if (!wishlist) {
      return res.status(200).json({ products: [] }); // return empty
    }

    // 👇 Format: [{ _id, product: {...}, addedAt }]
    res.status(200).json({
      products: wishlist.products.map((item) => ({
        _id: item._id,
        addedAt: item.addedAt,
        product: item.product,
      })),
    });
  } catch (err) {
    console.error('❌ Error loading wishlist:', err.message);
    res.status(500).json({ message: 'Failed to fetch wishlist' });
  }
};

// ➕ Add to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, products: [] });
    }

    const alreadyExists = wishlist.products.some(
      (item) => item.product.toString() === productId
    );

    if (alreadyExists) {
      return res.status(400).json({ message: 'Product already in wishlist' });
    }

    wishlist.products.push({ product: productId, addedAt: new Date() });
    await wishlist.save();

    res.status(200).json({ message: 'Added to wishlist' });
  } catch (err) {
    console.error('❌ Error adding to wishlist:', err.message);
    res.status(500).json({ message: 'Failed to add to wishlist' });
  }
};

// ❌ Remove from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: userId },
      { $pull: { products: { product: productId } } },
      { new: true }
    );

    res.status(200).json({ message: 'Removed from wishlist' });
  } catch (err) {
    console.error('❌ Error removing from wishlist:', err.message);
    res.status(500).json({ message: 'Failed to remove from wishlist' });
  }
};
