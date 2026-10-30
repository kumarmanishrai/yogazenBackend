const express = require('express');
const router = express.Router();
const orderController = require('../controller/orderController');
const isValidUser = require('../middleware/isValidUser');

// All order endpoints require valid user session
router.get('/my-orders', isValidUser, orderController.getMyOrders);
router.post('/', isValidUser, orderController.createOrder);
router.get('/:id', isValidUser, orderController.getOrderById);

module.exports = router;

