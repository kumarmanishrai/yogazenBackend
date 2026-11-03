const express = require('express');
const router = express.Router();
const orderController = require('../controller/orderController');
const isValidUser = require('../middleware/isValidUser');
const { isValidAdmin, requirePermission } = require('../middleware/isValidAdmin');

// --- Promotional Coupon Validation (Public/Auth) ---
router.post('/validate-coupon', orderController.validateCoupon);

// --- Admin Order Management & Fulfillment ---
router.get('/admin/all', isValidAdmin, requirePermission('orders'), orderController.adminGetAllOrders);
router.put('/admin/:id/status', isValidAdmin, requirePermission('orders'), orderController.adminUpdateOrderStatus);

// --- Admin Promotional Coupon Management ---
router.get('/admin/coupons', isValidAdmin, requirePermission('orders'), orderController.adminGetCoupons);
router.post('/admin/coupons', isValidAdmin, requirePermission('orders'), orderController.adminCreateCoupon);
router.put('/admin/coupons/:id/toggle', isValidAdmin, requirePermission('orders'), orderController.adminToggleCoupon);
router.delete('/admin/coupons/:id', isValidAdmin, requirePermission('orders'), orderController.adminDeleteCoupon);

// --- User Protected Order Endpoints ---
router.get('/my-orders', isValidUser, orderController.getMyOrders);
router.post('/', isValidUser, orderController.createOrder);
router.get('/:id', isValidUser, orderController.getOrderById);
router.put('/:id/cancel', isValidUser, orderController.cancelOrder);
router.put('/:id/return', isValidUser, orderController.requestReturn);
router.put('/:id/course-progress', isValidUser, orderController.updateCourseProgress);

module.exports = router;

