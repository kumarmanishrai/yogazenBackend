const mongoose = require('mongoose');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');

// Format each wishlist item with live inventory status
const formatWishlistItem = (item) => {
  const product = item.product;
  const availableStock = product?.stock !== undefined ? Number(product.stock) : 0;
  const isAvailable = product ? Boolean(product.isAvailable) : false;
  const isOutOfStock = !isAvailable || availableStock < 1;

  return {
    _id: item._id,
    product,
    addedAt: item.addedAt,
    availableStock,
    isOutOfStock,
    stockStatus: isOutOfStock ? 'OUT_OF_STOCK' : 'IN_STOCK',
    statusMessage: isOutOfStock ? 'Item out of stock' : 'In Stock'
  };
};

// @desc    Get current user's wishlist
// @route   GET /wishlist or GET /user/wishlist
// @access  Protected (User)
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist.product');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Filter out items where referenced product was deleted
    const initialCount = user.wishlist.length;
    user.wishlist = user.wishlist.filter((item) => item.product !== null);

    if (user.wishlist.length !== initialCount) {
      await user.save();
    }

    const formattedWishlist = user.wishlist.map(formatWishlistItem);

    return res.status(200).json({
      success: true,
      message: 'Wishlist retrieved successfully',
      count: formattedWishlist.length,
      wishlist: formattedWishlist
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wishlist',
      error: error.message
    });
  }
};

// @desc    Add product to user's wishlist
// @route   POST /wishlist/add or POST /wishlist
// @access  Protected (User)
exports.addToWishlist = async (req, res) => {
  try {
    const productId = req.body.productId || req.body.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    // Verify product exists in catalog
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Check if already in wishlist
    const exists = user.wishlist.some(
      (item) => item.product.toString() === productId.toString()
    );

    if (exists) {
      await user.populate('wishlist.product');
      const formattedWishlist = user.wishlist.map(formatWishlistItem);
      return res.status(200).json({
        success: true,
        message: 'Product is already in your wishlist',
        count: formattedWishlist.length,
        wishlist: formattedWishlist
      });
    }

    user.wishlist.push({
      product: productId,
      addedAt: new Date()
    });

    await user.save();
    await user.populate('wishlist.product');

    const formattedWishlist = user.wishlist.map(formatWishlistItem);

    return res.status(201).json({
      success: true,
      message: `"${product.title}" saved to your wishlist`,
      count: formattedWishlist.length,
      wishlist: formattedWishlist
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist',
      error: error.message
    });
  }
};

// @desc    Toggle product in wishlist (add if not present, remove if present)
// @route   POST /wishlist/toggle
// @access  Protected (User)
exports.toggleWishlist = async (req, res) => {
  try {
    const productId = req.body.productId || req.body.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    const existingIndex = user.wishlist.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    let action = '';
    let inWishlist = false;

    if (existingIndex > -1) {
      user.wishlist.splice(existingIndex, 1);
      action = 'removed';
      inWishlist = false;
    } else {
      user.wishlist.push({
        product: productId,
        addedAt: new Date()
      });
      action = 'added';
      inWishlist = true;
    }

    await user.save();
    await user.populate('wishlist.product');

    const formattedWishlist = user.wishlist.map(formatWishlistItem);

    return res.status(200).json({
      success: true,
      action,
      inWishlist,
      message: action === 'added' ? `"${product.title}" saved to wishlist` : `"${product.title}" removed from wishlist`,
      count: formattedWishlist.length,
      wishlist: formattedWishlist
    });
  } catch (error) {
    console.error('Error toggling wishlist item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle wishlist item',
      error: error.message
    });
  }
};

// @desc    Remove product from wishlist
// @route   DELETE /wishlist/remove/:productId or DELETE /wishlist/:productId
// @access  Protected (User)
exports.removeFromWishlist = async (req, res) => {
  try {
    const productId = req.params.productId || req.body.productId || req.body.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    const initialCount = user.wishlist.length;
    user.wishlist = user.wishlist.filter(
      (item) => item.product.toString() !== productId.toString()
    );

    if (user.wishlist.length === initialCount) {
      return res.status(404).json({
        success: false,
        message: 'Product was not found in your wishlist'
      });
    }

    await user.save();
    await user.populate('wishlist.product');

    const formattedWishlist = user.wishlist.map(formatWishlistItem);

    return res.status(200).json({
      success: true,
      message: 'Item removed from your wishlist successfully',
      count: formattedWishlist.length,
      wishlist: formattedWishlist
    });
  } catch (error) {
    console.error('Error removing product from wishlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove product from wishlist',
      error: error.message
    });
  }
};

// @desc    Move an item from wishlist to cart
// @route   POST /wishlist/move-to-cart or POST /wishlist/move-to-cart/:productId
// @access  Protected (User)
exports.moveToCart = async (req, res) => {
  try {
    const productId = req.params.productId || req.body.productId || req.body.id;
    const quantity = parseInt(req.body.quantity, 10) || 1;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    // Verify product exists and is available
    const product = await Product.findById(productId);
    if (!product || !product.isAvailable) {
      return res.status(404).json({
        success: false,
        message: 'Product is unavailable or does not exist'
      });
    }

    if (product.stock < 1) {
      return res.status(400).json({
        success: false,
        message: `Sorry, "${product.title}" is currently out of stock.`
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // 1. Remove from Wishlist
    user.wishlist = user.wishlist.filter(
      (item) => item.product.toString() !== productId.toString()
    );

    // 2. Add or Increment in Cart
    const existingCartIndex = user.cart.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (existingCartIndex > -1) {
      const newQuantity = user.cart[existingCartIndex].quantity + quantity;
      if (newQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Cannot move to cart: Only ${product.stock} units available in stock.`
        });
      }
      user.cart[existingCartIndex].quantity = newQuantity;
    } else {
      if (quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} units available in stock.`
        });
      }
      user.cart.push({
        product: productId,
        quantity,
        addedAt: new Date()
      });
    }

    await user.save();
    await user.populate('cart.product');
    await user.populate('wishlist.product');

    const formattedWishlist = user.wishlist.map(formatWishlistItem);

    return res.status(200).json({
      success: true,
      message: `"${product.title}" moved from your wishlist to your cart`,
      cart: user.cart,
      wishlist: formattedWishlist
    });
  } catch (error) {
    console.error('Error moving item from wishlist to cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to move item from wishlist to cart',
      error: error.message
    });
  }
};

// @desc    Clear all items in user's wishlist
// @route   DELETE /wishlist/clear or DELETE /wishlist
// @access  Protected (User)
exports.clearWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    user.wishlist = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully',
      count: 0,
      wishlist: []
    });
  } catch (error) {
    console.error('Error clearing wishlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear wishlist',
      error: error.message
    });
  }
};
