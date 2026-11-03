const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const { isValidAdmin, requirePermission } = require('../middleware/isValidAdmin');

// --- Public Auth Route ---
router.post('/login', adminController.login);

// --- Protected Admin Profile & Session ---
router.post('/logout', adminController.logout);
router.get('/profile', isValidAdmin, adminController.getProfile);
router.put('/profile', isValidAdmin, adminController.updateProfile);
router.put('/password', isValidAdmin, adminController.updatePassword);

// --- Protected Dashboard Metrics ---
router.get('/dashboard/stats', isValidAdmin, adminController.getDashboardStats);

// --- Superadmin Only: Sub-Admin & Role Management ---
router.get('/subadmins', isValidAdmin, requirePermission('admins'), adminController.getAllSubAdmins);
router.post('/subadmins', isValidAdmin, requirePermission('admins'), adminController.createSubAdmin);
router.put('/subadmins/:id', isValidAdmin, requirePermission('admins'), adminController.updateSubAdmin);
router.delete('/subadmins/:id', isValidAdmin, requirePermission('admins'), adminController.deleteSubAdmin);

// --- Protected Trainer & Course Management ---
router.get('/trainers', isValidAdmin, requirePermission('trainers'), adminController.getAllTrainers);
router.get('/trainers/pending', isValidAdmin, requirePermission('trainers'), adminController.getPendingTrainers);
router.patch('/trainers/:id/approval', isValidAdmin, requirePermission('trainers'), adminController.updateTrainerApproval);
router.patch('/trainers/:id/status', isValidAdmin, requirePermission('trainers'), adminController.toggleTrainerStatus);
router.patch('/trainers/:id/settings', isValidAdmin, requirePermission('trainers'), adminController.updateTrainerSettings);
router.delete('/trainers/:id', isValidAdmin, requirePermission('trainers'), adminController.deleteTrainer);

router.get('/courses', isValidAdmin, requirePermission('trainers'), adminController.getAllTrainerCourses);
router.patch('/courses/:id/status', isValidAdmin, requirePermission('trainers'), adminController.updateCourseStatus);
router.delete('/courses/:id', isValidAdmin, requirePermission('trainers'), adminController.deleteCourseByAdmin);

// --- Protected User Management (CRM) ---
router.get('/users', isValidAdmin, requirePermission('crm'), adminController.getAllUsers);
router.get('/users/:id', isValidAdmin, requirePermission('crm'), adminController.getUserById);
router.patch('/users/:id/status', isValidAdmin, requirePermission('crm'), adminController.toggleUserStatus);
router.delete('/users/:id', isValidAdmin, requirePermission('crm'), adminController.deleteUser);

// --- Protected Financial Transactions & FY Ledger ---
router.get('/financials/transactions', isValidAdmin, requirePermission('financials'), adminController.getFinancialTransactions);

// --- Protected Inventory & Product Management ---
router.post('/products', isValidAdmin, requirePermission('inventory'), adminController.createProduct);
router.post('/inventory', isValidAdmin, requirePermission('inventory'), adminController.createProduct);

router.get('/products', isValidAdmin, requirePermission('inventory'), adminController.getAllProducts);
router.get('/inventory', isValidAdmin, requirePermission('inventory'), adminController.getAllProducts);

router.get('/products/:id', isValidAdmin, requirePermission('inventory'), adminController.getProductById);
router.get('/inventory/:id', isValidAdmin, requirePermission('inventory'), adminController.getProductById);

router.put('/products/:id', isValidAdmin, requirePermission('inventory'), adminController.updateProduct);
router.put('/inventory/:id', isValidAdmin, requirePermission('inventory'), adminController.updateProduct);

router.patch('/products/:id/stock', isValidAdmin, requirePermission('inventory'), adminController.updateProductStock);
router.patch('/inventory/:id/stock', isValidAdmin, requirePermission('inventory'), adminController.updateProductStock);

router.delete('/products/:id', isValidAdmin, requirePermission('inventory'), adminController.deleteProduct);
router.delete('/inventory/:id', isValidAdmin, requirePermission('inventory'), adminController.deleteProduct);

// --- Protected Audit & Security Logs ---
router.get('/audit-logs', isValidAdmin, requirePermission('audit'), adminController.getAuditLogs);
router.get('/audit-logs/export', isValidAdmin, requirePermission('audit'), adminController.exportAuditLogs);

module.exports = router;

