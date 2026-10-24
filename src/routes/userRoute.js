const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const isValidUser = require('../middleware/isValidUser');

// --- Public Auth Routes ---
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/refresh-token', userController.refreshToken);
router.post('/logout', userController.logout);

// --- Protected User Profile Routes ---
router.get('/profile', isValidUser, userController.getProfile);
router.put('/profile', isValidUser, userController.updateProfile);
router.put('/password', isValidUser, userController.updatePassword);
router.delete('/profile', isValidUser, userController.deleteProfile);

// --- Protected Address Routes (E-Commerce) ---
router.post('/address', isValidUser, userController.addAddress);
router.put('/address/:id', isValidUser, userController.updateAddress);
router.delete('/address/:id', isValidUser, userController.deleteAddress);

// --- Protected Learning & Invoices Routes ---
router.get('/courses', isValidUser, userController.getEnrolledCourses);
router.get('/invoices/:invoiceId', isValidUser, userController.getInvoice);

module.exports = router;