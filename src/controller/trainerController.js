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
const { logAuthEvent } = require('../services/auditLogger');

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

    logAuthEvent(req, {
      actor: { id: newTrainer._id, email: newTrainer.email, role: 'trainer' },
      action: 'AUTH_REGISTER',
      status: 'SUCCESS'
    });

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
      logAuthEvent(req, {
        actor: { email: normalizedEmail, role: 'trainer' },
        action: 'AUTH_LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'warning',
        details: { reason: 'Trainer account not found' }
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, trainer.password);
    if (!isMatch) {
      logAuthEvent(req, {
        actor: { id: trainer._id, email: trainer.email, name: trainer.name, role: 'trainer' },
        action: 'AUTH_LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'warning',
        details: { reason: 'Incorrect password' }
      });
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

    await logAuthEvent(req, {
      actor: { id: trainer._id, email: trainer.email, name: trainer.name, role: 'trainer' },
      action: 'AUTH_LOGIN',
      status: 'SUCCESS'
    });

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
    let actorTrainer = null;

    if (incomingRefreshToken) {
      actorTrainer = await Trainer.findOneAndUpdate(
        { refreshTokens: incomingRefreshToken },
        { $pull: { refreshTokens: incomingRefreshToken } }
      );
    }

    if (!actorTrainer && req.headers?.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (decoded?.id) {
          actorTrainer = await Trainer.findById(decoded.id);
        }
      } catch (e) {}
    }

    if (!actorTrainer && (req.body?.email || req.body?.id || req.body?.trainerId)) {
      const email = req.body.email ? req.body.email.toLowerCase().trim() : undefined;
      const id = req.body.id || req.body.trainerId;
      actorTrainer = await Trainer.findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(id ? [{ _id: id }] : [])
        ]
      });
    }

    if (!actorTrainer && req.trainer) {
      actorTrainer = req.trainer;
    }

    await logAuthEvent(req, {
      actor: {
        id: actorTrainer?._id,
        email: actorTrainer?.email || req.body?.email || 'trainer@yogazen',
        name: actorTrainer?.name || 'Trainer',
        role: 'trainer'
      },
      action: 'AUTH_LOGOUT',
      status: 'SUCCESS',
      details: { reason: 'Trainer initiated logout' }
    });

    clearTokenCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error in trainer logout:', error);
    clearTokenCookies(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out'
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

// @desc    Get a single course owned by trainer
// @route   GET /trainer/courses/:id
// @access  Protected (Trainer)
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findOne({ _id: id, trainer: req.trainer._id }).populate('trainer', 'name email contact bio categories experienceYears');
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }
    return res.status(200).json({
      success: true,
      course
    });
  } catch (error) {
    console.error('Error retrieving trainer course by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve course details',
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
        message: 'Action blocked: Please complete your trainer profile (name, contact number, bio, and training categories) before adding or publishing courses.'
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

// Helper to extract YouTube Video/Live ID
const extractYouTubeId = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : '';
};

// @desc    Update course details
// @route   PUT /trainer/courses/:id
// @access  Protected (Trainer)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findOne({ _id: id, trainer: req.trainer._id });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    const { title, description, category, level, price, duration, thumbnail } = req.body;
    if (title !== undefined) course.title = title.trim();
    if (description !== undefined) course.description = description.trim();
    if (category !== undefined) course.category = category.trim();
    if (level !== undefined) course.level = level;
    if (price !== undefined) course.price = Math.max(0, parseFloat(price) || 0);
    if (duration !== undefined) course.duration = duration;
    if (thumbnail !== undefined) course.thumbnail = thumbnail;

    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      course
    });
  } catch (error) {
    console.error('Error updating course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update course',
      error: error.message
    });
  }
};

// @desc    Delete course
// @route   DELETE /trainer/courses/:id
// @access  Protected (Trainer)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findOneAndDelete({ _id: id, trainer: req.trainer._id });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    // Remove from trainer's courses list
    await Trainer.findByIdAndUpdate(req.trainer._id, {
      $pull: { courses: id }
    });

    return res.status(200).json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete course',
      error: error.message
    });
  }
};

// @desc    Add a new class to an existing course
// @route   POST /trainer/courses/:id/classes
// @access  Protected (Trainer)
exports.addClassToCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findOne({ _id: id, trainer: req.trainer._id });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    const {
      title,
      description,
      duration = '45 mins',
      scheduledAt,
      type = 'Live Stream',
      meetingUrl = '',
      videoUrl = '',
      youtubeVideoId = ''
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Class title is required'
      });
    }

    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduled date and time'
        });
      }
      // Cannot schedule in the past (allow 3 min grace for latency)
      if (scheduledDate < new Date(Date.now() - 3 * 60 * 1000)) {
        return res.status(400).json({
          success: false,
          message: 'Class scheduled date and time cannot be in the past'
        });
      }
    }

    const resolvedYouTubeId = youtubeVideoId || extractYouTubeId(videoUrl || meetingUrl);

    const newClass = {
      title: title.trim(),
      description: (description || '').trim(),
      duration: duration || '45 mins',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      type: type || 'Live Stream',
      meetingUrl: meetingUrl.trim(),
      videoUrl: videoUrl.trim() || meetingUrl.trim(),
      youtubeVideoId: resolvedYouTubeId,
      status: 'scheduled',
      isLive: false,
      recordingUrl: ''
    };

    course.classes.push(newClass);
    await course.save();

    const addedClass = course.classes[course.classes.length - 1];

    return res.status(201).json({
      success: true,
      message: 'Class added to course successfully',
      course,
      class: addedClass
    });
  } catch (error) {
    console.error('Error adding class to course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add class',
      error: error.message
    });
  }
};

// @desc    Update a class within a course
// @route   PUT /trainer/courses/:id/classes/:classId
// @access  Protected (Trainer)
exports.updateClass = async (req, res) => {
  try {
    const { id, classId } = req.params;
    const course = await Course.findOne({ _id: id, trainer: req.trainer._id });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    const targetClass = course.classes.id(classId) || course.classes.find(c => c._id.toString() === classId);
    if (!targetClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found in this course'
      });
    }

    const {
      title,
      description,
      duration,
      scheduledAt,
      type,
      meetingUrl,
      videoUrl,
      youtubeVideoId,
      recordingUrl
    } = req.body;

    if (title !== undefined) targetClass.title = title.trim();
    if (description !== undefined) targetClass.description = description.trim();
    if (duration !== undefined) targetClass.duration = duration;
    if (scheduledAt !== undefined) {
      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduled date and time'
        });
      }
      if (scheduledDate < new Date(Date.now() - 3 * 60 * 1000)) {
        return res.status(400).json({
          success: false,
          message: 'Class scheduled date and time cannot be in the past'
        });
      }
      targetClass.scheduledAt = scheduledDate;
    }
    if (type !== undefined) targetClass.type = type;
    if (meetingUrl !== undefined) targetClass.meetingUrl = meetingUrl.trim();
    if (videoUrl !== undefined) targetClass.videoUrl = videoUrl.trim();
    if (recordingUrl !== undefined) targetClass.recordingUrl = recordingUrl.trim();

    const ytId = youtubeVideoId || extractYouTubeId(targetClass.videoUrl || targetClass.meetingUrl);
    if (ytId) targetClass.youtubeVideoId = ytId;

    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      course,
      class: targetClass
    });
  } catch (error) {
    console.error('Error updating class:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update class',
      error: error.message
    });
  }
};

// @desc    Delete a class from a course
// @route   DELETE /trainer/courses/:id/classes/:classId
// @access  Protected (Trainer)
exports.deleteClass = async (req, res) => {
  try {
    const { id, classId } = req.params;
    const course = await Course.findOne({ _id: id, trainer: req.trainer._id });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    course.classes = course.classes.filter(
      (cls) => (cls._id ? cls._id.toString() : cls.id) !== classId
    );
    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Class deleted successfully',
      course
    });
  } catch (error) {
    console.error('Error deleting class:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete class',
      error: error.message
    });
  }
};

// @desc    Set Class Live Status (Trainer Starts / Ends Live Stream)
// @route   PUT /trainer/courses/:id/classes/:classId/live-status
// @access  Protected (Trainer)
exports.updateClassLiveStatus = async (req, res) => {
  try {
    const { id, classId } = req.params;
    const { isLive, youtubeVideoId, videoUrl } = req.body;

    const course = await Course.findOne({ _id: id, trainer: req.trainer._id });
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or unauthorized'
      });
    }

    const targetClass = course.classes.id(classId) || course.classes.find(c => c._id.toString() === classId);
    if (!targetClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found in this course'
      });
    }

    if (isLive === true) {
      // Start live stream
      targetClass.isLive = true;
      targetClass.status = 'live';
      targetClass.startedAt = new Date();
      if (videoUrl) targetClass.videoUrl = videoUrl.trim();
      const ytId = youtubeVideoId || extractYouTubeId(videoUrl || targetClass.videoUrl || targetClass.meetingUrl);
      if (ytId) targetClass.youtubeVideoId = ytId;
    } else {
      // End live stream & archive as recorded session
      targetClass.isLive = false;
      targetClass.status = 'completed';
      targetClass.endedAt = new Date();
      if (videoUrl) {
        targetClass.recordingUrl = videoUrl.trim();
      } else if (targetClass.youtubeVideoId) {
        targetClass.recordingUrl = `https://www.youtube.com/watch?v=${targetClass.youtubeVideoId}`;
      }
    }

    await course.save();

    return res.status(200).json({
      success: true,
      message: isLive ? 'Class is now LIVE! Students can join stream.' : 'Live stream ended. Class saved to recordings.',
      course,
      class: targetClass
    });
  } catch (error) {
    console.error('Error updating live status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update class live status',
      error: error.message
    });
  }
};

// Public discovery route: list approved trainers with category filtering
exports.getPublicTrainers = async (req, res) => {
  res.status(501).json({ message: 'Get public trainers endpoint not yet implemented' });
};
