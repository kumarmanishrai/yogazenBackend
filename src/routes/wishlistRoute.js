const express = require('express');
const router = express.Router();
const wishlistController = require('../controller/wishlistController');
const isValidUser = require('../middleware/isValidUser');

// Enforce authenticated user middleware on all wishlist endpoints
router.use(isValidUser);

// GET /wishlist - Fetch user wishlist with populated product details
router.get('/', wishlistController.getWishlist);

// POST /wishlist/add (or POST /wishlist) - Add product to wishlist
router.post('/add', wishlistController.addToWishlist);
router.post('/', wishlistController.addToWishlist);

// POST /wishlist/toggle - Toggle product in wishlist (add/remove)
router.post('/toggle', wishlistController.toggleWishlist);

// DELETE /wishlist/remove/:productId (or DELETE /wishlist/:productId) - Remove item
router.delete('/remove/:productId', wishlistController.removeFromWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

// POST /wishlist/move-to-cart (or POST /wishlist/move-to-cart/:productId) - Move to cart
router.post('/move-to-cart', wishlistController.moveToCart);
router.post('/move-to-cart/:productId', wishlistController.moveToCart);

// DELETE /wishlist/clear (or DELETE /wishlist) - Empty user's wishlist
router.delete('/clear', wishlistController.clearWishlist);
router.delete('/', wishlistController.clearWishlist);

module.exports = router;

