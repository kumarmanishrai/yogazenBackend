const express = require('express');
const router = express.Router();
const courseController = require('../controller/courseController');
const isValidUser = require('../middleware/isValidUser');

// --- Public Course Routes ---
router.get('/', courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);

// --- Protected Course Actions (User) ---
router.post('/:id/reviews', isValidUser, courseController.addCourseReview);
router.post('/:id/enroll', isValidUser, courseController.enrollInCourse);

module.exports = router;

