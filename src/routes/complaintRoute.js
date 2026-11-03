const express = require('express');
const router = express.Router();
const complaintController = require('../controller/complaintController');
const isValidUser = require('../middleware/isValidUser');
const { isValidAdmin, requirePermission } = require('../middleware/isValidAdmin');

// --- User Protected Routes ---
router.post('/', isValidUser, complaintController.createComplaint);
router.get('/my-complaints', isValidUser, complaintController.getMyComplaints);

// --- Admin Protected Routes ---
router.get('/admin/stats', isValidAdmin, requirePermission('complaints'), complaintController.adminGetComplaintStats);
router.get('/admin/all', isValidAdmin, requirePermission('complaints'), complaintController.adminGetAllComplaints);
router.put('/admin/:id', isValidAdmin, requirePermission('complaints'), complaintController.adminUpdateComplaint);

module.exports = router;

