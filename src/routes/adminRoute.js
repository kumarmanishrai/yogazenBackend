const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const isValidAdmin = require('../middleware/isValidAdmin');

// --- Public Auth Route ---
router.post('/login', adminController.login);

// --- Protected Admin Profile ---
router.get('/profile', isValidAdmin, adminController.getProfile);
router.put('/profile', isValidAdmin, adminController.updateProfile);
router.put('/password', isValidAdmin, adminController.updatePassword);

// --- Protected Dashboard & Analytics ---
router.get('/dashboard/stats', isValidAdmin, adminController.getDashboardStats);
router.get('/analytics', isValidAdmin, adminController.getAnalytics);

// --- Protected Trainer Management (Approvals & Moderation) ---
router.get('/trainers', isValidAdmin, adminController.getAllTrainers);
router.get('/trainers/pending', isValidAdmin, adminController.getPendingTrainers);
router.patch('/trainers/:id/approval', isValidAdmin, adminController.updateTrainerApproval);
router.delete('/trainers/:id', isValidAdmin, adminController.deleteTrainer);

// --- Protected User Management (CRM & Moderation) ---
router.get('/users', isValidAdmin, adminController.getAllUsers);
router.get('/users/:id', isValidAdmin, adminController.getUserById);
router.delete('/users/:id', isValidAdmin, adminController.deleteUser);

module.exports = router;

