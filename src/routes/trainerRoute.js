const express = require('express');
const router = express.Router();
const trainerController = require('../controller/trainerController');
const isValidTrainer = require('../middleware/isValidTrainer');

// --- Public Routes ---
router.post('/register', trainerController.register);
router.post('/login', trainerController.login);
router.post('/refresh-token', trainerController.refreshToken);
router.post('/logout', trainerController.logout);
router.get('/public', trainerController.getPublicTrainers); // For user discovery & category filtering

// --- Protected Trainer Profile & Earnings Routes ---
router.get('/profile', isValidTrainer, trainerController.getProfile);
router.put('/profile', isValidTrainer, trainerController.updateProfile);
router.put('/password', isValidTrainer, trainerController.updatePassword);
router.put('/payout-details', isValidTrainer, trainerController.updatePayoutDetails);
router.get('/earnings', isValidTrainer, trainerController.getEarnings);

// --- Protected Course Management Routes ---
router.get('/courses', isValidTrainer, trainerController.getMyCourses);
router.post('/courses', isValidTrainer, trainerController.createCourse);
router.put('/courses/:id', isValidTrainer, trainerController.updateCourse);
router.delete('/courses/:id', isValidTrainer, trainerController.deleteCourse);

module.exports = router;
