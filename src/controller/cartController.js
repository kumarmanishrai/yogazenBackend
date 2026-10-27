const mongoose = require('mongoose');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');

// Format each cart item with real-time stock and pricing breakdown
const formatCartItem = (item) => {
  const product = item.product;
  const requestedQty = Number(item.quantity) || 1;
  const availableStock = product?.stock !== undefined ? Number(product.stock) : 0;
  const isAvailable = product ? Boolean(product.isAvailable) : false;

  const isOutOfStock = !isAvailable || availableStock < 1;
  const isQuantityExceeded = !isOutOfStock && requestedQty > availableStock;

  let stockStatus = 'IN_STOCK';
  let statusMessage = 'In Stock';

  if (isOutOfStock) {
    stockStatus = 'OUT_OF_STOCK';
    statusMessage = 'Item out of stock';
  } else if (isQuantityExceeded) {
    stockStatus = 'QUANTITY_EXCEEDED';
    statusMessage = `Only ${availableStock} unit${availableStock > 1 ? 's' : ''} left in stock (you requested ${requestedQty})`;
  }

  const basePrice = Number(product?.price) || 0;
  const effectivePrice = Number(product?.discountPrice) > 0 ? Number(product.discountPrice) : basePrice;

  return {
    _id: item._id,
    product,
    quantity: requestedQty,
    addedAt: item.addedAt,
    availableStock,
    isOutOfStock,
    isQuantityExceeded,
    stockStatus,
    statusMessage,
    unitPrice: effectivePrice,
    itemTotal: Math.round(effectivePrice * requestedQty * 100) / 100
  };
};

// Helper to compute cart financial breakdown and checkout eligibility
const calculateCartSummary = (formattedCart) => {
  let totalItems = 0;
  let originalSubtotal = 0;
  let subtotal = 0;
  let hasOutOfStockItems = false;
  let hasQuantityExceededItems = false;

  for (const item of formattedCart) {
    if (!item.product) continue;

    if (item.isOutOfStock) {
      hasOutOfStockItems = true;
      continue; // Exclude out-of-stock items from active purchasable total
    }

    if (item.isQuantityExceeded) {
      hasQuantityExceededItems = true;
    }

    const qty = item.quantity;
    const basePrice = Number(item.product.price) || 0;
    const effectivePrice = Number(item.unitPrice) || basePrice;

    totalItems += qty;
    originalSubtotal += basePrice * qty;
    subtotal += effectivePrice * qty;
  }

  const discountSavings = Math.max(0, originalSubtotal - subtotal);
  // Free delivery for orders over ₹999 or when cart has no active items
  const shippingFee = totalItems === 0 || subtotal >= 999 ? 0 : 99;
  const totalAmount = subtotal + shippingFee;

  // Checkout is allowed only if cart has items and none are out of stock or exceed inventory
  const canCheckout = formattedCart.length > 0 && !hasOutOfStockItems && !hasQuantityExceededItems;

  return {
    totalItems,
    originalSubtotal: Math.round(originalSubtotal * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    discountSavings: Math.round(discountSavings * 100) / 100,
    shippingFee,
    totalAmount: Math.round(totalAmount * 100) / 100,
    hasOutOfStockItems,
    hasQuantityExceededItems,
    canCheckout
  };
};

// @desc    Get current user's shopping cart
// @route   GET /cart or GET /user/cart
// @access  Protected (User)
exports.getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('cart.product');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Clean up any cart items where the product might have been deleted from DB
    const initialCount = user.cart.length;
    user.cart = user.cart.filter((item) => item.product !== null);

    if (user.cart.length !== initialCount) {
      await user.save();
    }

    const formattedCart = user.cart.map(formatCartItem);
    const summary = calculateCartSummary(formattedCart);

    return res.status(200).json({
      success: true,
      message: 'Cart retrieved successfully',
      cart: formattedCart,
      summary
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve cart',
      error: error.message
    });
  }
};

// @desc    Add product to cart or increment quantity
// @route   POST /cart/add or POST /cart
// @access  Protected (User)
exports.addToCart = async (req, res) => {
  try {
    const productId = req.body.productId || req.body.id;
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

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    // Check if product exists in catalog
    const product = await Product.findById(productId);
    if (!product || !product.isAvailable) {
      return res.status(404).json({
        success: false,
        message: 'Product is unavailable or does not exist'
      });
    }

    // Check inventory stock
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

    // Check if item already exists in cart
    const existingIndex = user.cart.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (existingIndex > -1) {
      const newQuantity = user.cart[existingIndex].quantity + quantity;
      if (newQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more. Only ${product.stock} units available in stock.`
        });
      }
      user.cart[existingIndex].quantity = newQuantity;
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

    const formattedCart = user.cart.map(formatCartItem);
    const summary = calculateCartSummary(formattedCart);

    return res.status(200).json({
      success: true,
      message: `"${product.title}" added to your cart successfully`,
      cart: formattedCart,
      summary
    });
  } catch (error) {
    console.error('Error adding item to cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to cart',
      error: error.message
    });
  }
};

// @desc    Update quantity of specific product in cart
// @route   PUT /cart/update or PUT /cart/:productId
// @access  Protected (User)
exports.updateCartItem = async (req, res) => {
  try {
    const productId = req.params.productId || req.body.productId || req.body.id;
    const quantity = parseInt(req.body.quantity, 10);

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

    if (isNaN(quantity)) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity number is required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    const itemIndex = user.cart.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in your cart'
      });
    }

    // If quantity is 0 or less, remove item from cart
    if (quantity <= 0) {
      user.cart.splice(itemIndex, 1);
      await user.save();
      await user.populate('cart.product');

      const formattedCart = user.cart.map(formatCartItem);
      const summary = calculateCartSummary(formattedCart);
      return res.status(200).json({
        success: true,
        message: 'Item removed from your cart',
        cart: formattedCart,
        summary
      });
    }

    // Verify stock availability
    const product = await Product.findById(productId);
    if (product && quantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} units available in stock.`
      });
    }

    user.cart[itemIndex].quantity = quantity;
    await user.save();
    await user.populate('cart.product');

    const formattedCart = user.cart.map(formatCartItem);
    const summary = calculateCartSummary(formattedCart);

    return res.status(200).json({
      success: true,
      message: 'Cart item quantity updated',
      cart: formattedCart,
      summary
    });
  } catch (error) {
    console.error('Error updating cart item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update cart item',
      error: error.message
    });
  }
};

// @desc    Remove an item from cart
// @route   DELETE /cart/remove/:productId or DELETE /cart/:productId
// @access  Protected (User)
exports.removeFromCart = async (req, res) => {
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

    const originalLength = user.cart.length;
    user.cart = user.cart.filter(
      (item) => item.product.toString() !== productId.toString()
    );

    if (user.cart.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: 'Item was not found in your cart'
      });
    }

    await user.save();
    await user.populate('cart.product');

    const formattedCart = user.cart.map(formatCartItem);
    const summary = calculateCartSummary(formattedCart);

    return res.status(200).json({
      success: true,
      message: 'Item removed from your cart successfully',
      cart: formattedCart,
      summary
    });
  } catch (error) {
    console.error('Error removing item from cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
};

// @desc    Clear all items in cart
// @route   DELETE /cart/clear or DELETE /cart
// @access  Protected (User)
exports.clearCart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    user.cart = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      cart: [],
      summary: {
        totalItems: 0,
        originalSubtotal: 0,
        subtotal: 0,
        discountSavings: 0,
        shippingFee: 0,
        totalAmount: 0,
        hasOutOfStockItems: false,
        hasQuantityExceededItems: false,
        canCheckout: false
      }
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
};
