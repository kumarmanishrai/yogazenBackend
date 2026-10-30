const bcrypt = require('bcryptjs');
const Trainer = require('../models/trainerSchema');
const Course = require('../models/courseSchema');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies
} = require('../helper/generateToken');

// @desc    Register a new trainer (email & password only)
// @route   POST /trainer/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingTrainer = await Trainer.findOne({ email: normalizedEmail });
    if (existingTrainer) {
      return res.status(409).json({
        success: false,
        message: 'A trainer account with this email already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newTrainer = await Trainer.create({
      email: normalizedEmail,
      password: hashedPassword,
      isApproved: false // Requires admin approval before courses are publicly visible
    });

    // Generate Access (15min) and Refresh (60d) tokens
    const tokenPayload = { id: newTrainer._id, email: newTrainer.email, role: 'trainer' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: newTrainer._id, role: 'trainer' });

    newTrainer.refreshTokens = [refreshToken];
    await newTrainer.save();

    setTokenCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'Trainer registered successfully. Complete your profile anytime.',
      accessToken,
      refreshToken,
      trainer: {
        id: newTrainer._id,
        email: newTrainer.email,
        name: newTrainer.name || '',
        contact: newTrainer.contact || '',
        bio: newTrainer.bio || '',
        categories: newTrainer.categories || [],
        experienceYears: newTrainer.experienceYears || 0,
        isApproved: newTrainer.isApproved,
        role: 'trainer',
        totalEarnings: newTrainer.totalEarnings,
        isProfileComplete: Boolean(newTrainer.name && newTrainer.bio && newTrainer.categories.length > 0)
      }
    });
  } catch (error) {
    console.error('Error in trainer registration:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during trainer registration',
      error: error.message
    });
  }
};

// @desc    Authenticate trainer & set token cookies
// @route   POST /trainer/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trainer = await Trainer.findOne({ email: normalizedEmail });
    if (!trainer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, trainer.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate Access (7d) & Refresh (60d) tokens
    const tokenPayload = { id: trainer._id, email: trainer.email, role: 'trainer' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: trainer._id, role: 'trainer' });

    // Keep up to 5 concurrent sessions
    const activeSessions = (trainer.refreshTokens || []).slice(-4);
    activeSessions.push(refreshToken);
    trainer.refreshTokens = activeSessions;
    await trainer.save();

    setTokenCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Trainer logged in successfully',
      accessToken,
      refreshToken,
      trainer: {
        id: trainer._id,
        email: trainer.email,
        name: trainer.name || '',
        contact: trainer.contact || '',
        bio: trainer.bio || '',
        categories: trainer.categories || [],
        experienceYears: trainer.experienceYears || 0,
        isApproved: trainer.isApproved,
        role: 'trainer',
        totalEarnings: trainer.totalEarnings,
        isProfileComplete: Boolean(trainer.name && trainer.bio && trainer.categories.length > 0)
      }
    });
  } catch (error) {
    console.error('Error in trainer login:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during trainer login',
      error: error.message
    });
  }
};

// @desc    Refresh Trainer Access Token using Refresh Token cookie
// @route   POST /trainer/refresh-token
// @access  Public (via cookie)
exports.refreshToken = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided. Please log in.'
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(incomingRefreshToken);
    } catch (err) {
      clearTokenCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Refresh token expired or invalid. Please log in again.'
      });
    }

    if (decoded.role !== 'trainer') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token role.'
      });
    }

    const trainer = await Trainer.findById(decoded.id);
    if (!trainer || !trainer.refreshTokens || !trainer.refreshTokens.includes(incomingRefreshToken)) {
      clearTokenCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Refresh token is invalid or has been revoked.'
      });
    }

    const tokenPayload = { id: trainer._id, email: trainer.email, role: 'trainer' };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken({ id: trainer._id, role: 'trainer' });

    trainer.refreshTokens = trainer.refreshTokens.filter((token) => token !== incomingRefreshToken);
    trainer.refreshTokens.push(newRefreshToken);
    await trainer.save();

    setTokenCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while refreshing token',
      error: error.message
    });
  }
};

// @desc    Log out trainer & clear cookies
// @route   POST /trainer/logout
// @access  Public / Authenticated
exports.logout = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (incomingRefreshToken) {
      await Trainer.findOneAndUpdate(
        { refreshTokens: incomingRefreshToken },
        { $pull: { refreshTokens: incomingRefreshToken } }
      );
    }

    clearTokenCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error in trainer logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    });
  }
};

// @desc    Get current trainer profile
// @route   GET /trainer/profile
// @access  Protected
exports.getProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    trainer: req.trainer
  });
};

// @desc    Update trainer profile
// @route   PUT /trainer/profile
// @access  Protected (Trainer)
exports.updateProfile = async (req, res) => {
  try {
    const { name, contact, bio, experienceYears, categories } = req.body;
    const trainer = req.trainer;

    if (name !== undefined) trainer.name = name.trim();
    if (contact !== undefined) trainer.contact = contact.trim();
    if (bio !== undefined) trainer.bio = bio.trim();
    if (experienceYears !== undefined) trainer.experienceYears = parseInt(experienceYears, 10) || 0;
    if (Array.isArray(categories)) {
      trainer.categories = categories.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
    }

    await trainer.save();

    const isProfileComplete = Boolean(
      trainer.name &&
      trainer.contact &&
      trainer.bio &&
      trainer.categories &&
      trainer.categories.length > 0
    );

    return res.status(200).json({
      success: true,
      message: 'Trainer profile updated successfully',
      trainer: {
        id: trainer._id,
        name: trainer.name,
        email: trainer.email,
        contact: trainer.contact,
        bio: trainer.bio,
        categories: trainer.categories,
        experienceYears: trainer.experienceYears,
        isApproved: trainer.isApproved,
        payoutDetails: trainer.payoutDetails,
        role: trainer.role,
        isProfileComplete
      }
    });
  } catch (error) {
    console.error('Error updating trainer profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update trainer profile',
      error: error.message
    });
  }
};

exports.updatePassword = async (req, res) => {
  res.status(501).json({ message: 'Update password endpoint not yet implemented' });
};

// @desc    Update trainer payout details
// @route   PUT /trainer/payout-details
// @access  Protected (Trainer)
exports.updatePayoutDetails = async (req, res) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, upiId } = req.body;
    const trainer = req.trainer;

    trainer.payoutDetails = {
      accountHolderName: (accountHolderName || '').trim(),
      accountNumber: (accountNumber || '').trim(),
      ifscCode: (ifscCode || '').trim(),
      upiId: (upiId || '').trim()
    };

    await trainer.save();

    return res.status(200).json({
      success: true,
      message: 'Payout & bank details saved successfully',
      payoutDetails: trainer.payoutDetails
    });
  } catch (error) {
    console.error('Error updating payout details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payout details',
      error: error.message
    });
  }
};

exports.getEarnings = async (req, res) => {
  return res.status(200).json({
    success: true,
    totalEarnings: req.trainer.totalEarnings || 0
  });
};

// @desc    Get trainer's created courses
// @route   GET /trainer/courses
// @access  Protected (Trainer)
exports.getMyCourses = async (req, res) => {
  try {
    const courses = await Course.find({ trainer: req.trainer._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    console.error('Error retrieving trainer courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your courses',
      error: error.message
    });
  }
};

// @desc    Create a new course (STRICT PROFILE COMPLETION GUARD)
// @route   POST /trainer/courses
// @access  Protected (Trainer)
exports.createCourse = async (req, res) => {
  try {
    const trainer = req.trainer;

    // Strict Profile Completeness Check:
    // Trainer must have entered their name, contact, bio, and at least one category
    const isProfileComplete = Boolean(
      trainer.name &&
      trainer.name.trim() &&
      trainer.contact &&
      trainer.contact.trim() &&
      trainer.bio &&
      trainer.bio.trim() &&
      trainer.categories &&
      trainer.categories.length > 0
    );

    if (!isProfileComplete) {
      return res.status(403).json({
        success: false,
        code: 'PROFILE_INCOMPLETE',
        message: 'Action blocked: Please complete your trainer profile (name, contact number, bio, and teaching categories) before adding or publishing courses.'
      });
    }

    const { title, description, category, level, price, classes } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Course title is required'
      });
    }

    const newCourse = await Course.create({
      trainer: trainer._id,
      title: title.trim(),
      description: (description || '').trim(),
      category: (category || trainer.categories[0] || 'Hatha Yoga').trim(),
      level: level || 'All Levels',
      price: parseFloat(price) || 0,
      classes: Array.isArray(classes) ? classes : []
    });

    trainer.courses.push(newCourse._id);
    await trainer.save();

    return res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course: newCourse
    });
  } catch (error) {
    console.error('Error creating course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create course',
      error: error.message
    });
  }
};

exports.updateCourse = async (req, res) => {
  res.status(501).json({ message: 'Update course endpoint not yet implemented' });
};

exports.deleteCourse = async (req, res) => {
  res.status(501).json({ message: 'Delete course endpoint not yet implemented' });
};

// Public discovery route: list approved trainers with category filtering
exports.getPublicTrainers = async (req, res) => {
  res.status(501).json({ message: 'Get public trainers endpoint not yet implemented' });
};
