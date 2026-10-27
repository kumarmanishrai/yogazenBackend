const express = require('express');
const router = express.Router();
const cartController = require('../controller/cartController');
const isValidUser = require('../middleware/isValidUser');

// Enforce authenticated user middleware on all cart endpoints
router.use(isValidUser);

// GET /cart - Fetch user cart with populated product data & order summary
router.get('/', cartController.getCart);

// POST /cart/add (or POST /cart) - Add item to cart or increment quantity
router.post('/add', cartController.addToCart);
router.post('/', cartController.addToCart);

// PUT /cart/update (or PUT /cart/:productId) - Update item quantity
router.put('/update', cartController.updateCartItem);
router.put('/:productId', cartController.updateCartItem);

// DELETE /cart/remove/:productId (or DELETE /cart/:productId) - Remove item
router.delete('/remove/:productId', cartController.removeFromCart);
router.delete('/:productId', cartController.removeFromCart);

// DELETE /cart/clear (or DELETE /cart) - Empty user's cart
router.delete('/clear', cartController.clearCart);
router.delete('/', cartController.clearCart);

module.exports = router;

