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
router.get('/courses/:id', isValidTrainer, trainerController.getCourseById);
router.post('/courses', isValidTrainer, trainerController.createCourse);
router.put('/courses/:id', isValidTrainer, trainerController.updateCourse);
router.delete('/courses/:id', isValidTrainer, trainerController.deleteCourse);

// --- Protected Course Classes & Live Streaming Routes ---
router.post('/courses/:id/classes', isValidTrainer, trainerController.addClassToCourse);
router.put('/courses/:id/classes/:classId', isValidTrainer, trainerController.updateClass);
router.delete('/courses/:id/classes/:classId', isValidTrainer, trainerController.deleteClass);
router.put('/courses/:id/classes/:classId/live-status', isValidTrainer, trainerController.updateClassLiveStatus);

module.exports = router;
