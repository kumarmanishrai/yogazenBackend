const express = require("express");
const router = express.Router();
const isValidTrainer = require('../middleware/isValidTrainer')

// router.post('/register', trainerController.register);
// router.post('/login', trainerController.login);
// router.post('/login/pin', trainerController.loginPin);
// router.get('/about',isValidUser, trainerController.about);
// router.put('/about/email',isValidUser, trainerController.updateTrainerEmail);
// router.put('/about/contact',isValidUser, trainerController.updateTrainerContact);
// router.put('/password',isValidUser, trainerController.updatePassword);
// router.put('/pin',isValidUser, trainerController.updatePin);
// router.delete('/delete/profile', trainerController.deleteProfile)

module.exports = router;