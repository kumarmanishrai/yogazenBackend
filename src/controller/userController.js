const bcrypt = require('bcryptjs');
const User = require('../models/userSchema');
const Course = require('../models/courseSchema');
const Order = require('../models/orderSchema');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies
} = require('../helper/generateToken');
const { logAuthEvent } = require('../services/auditLogger');

// @desc    Register a new user (email & password only)
// @route   POST /user/register
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
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      email: normalizedEmail,
      password: hashedPassword
    });

    // Generate Access (7d) and Refresh (60d) tokens
    const tokenPayload = { id: newUser._id, email: newUser.email, role: 'user' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: newUser._id, role: 'user' });

    // Store refresh token in user document array (supports multiple devices/sessions)
    newUser.refreshTokens = [refreshToken];
    await newUser.save();

    // Store tokens in HTTP-Only cookies
    setTokenCookies(res, accessToken, refreshToken);

    logAuthEvent(req, {
      actor: { id: newUser._id, email: newUser.email, role: 'user' },
      action: 'AUTH_REGISTER',
      status: 'SUCCESS'
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Complete your profile anytime.',
      accessToken,
      refreshToken,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name || '',
        contact: newUser.contact || '',
        role: 'user',
        isProfileComplete: Boolean(newUser.name && newUser.contact)
      }
    });
  } catch (error) {
    console.error('Error in user registration:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// @desc    Authenticate user & set token cookies
// @route   POST /user/login
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
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      logAuthEvent(req, {
        actor: { email: normalizedEmail, role: 'user' },
        action: 'AUTH_LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'warning',
        details: { reason: 'User account not found' }
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logAuthEvent(req, {
        actor: { id: user._id, email: user.email, name: user.name, role: 'user' },
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
    const tokenPayload = { id: user._id, email: user.email, role: 'user' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: user._id, role: 'user' });

    // Add refresh token to sessions list (keep last 5 active sessions)
    const activeSessions = (user.refreshTokens || []).slice(-4);
    activeSessions.push(refreshToken);
    user.refreshTokens = activeSessions;
    await user.save();

    // Set HTTP-Only cookies
    setTokenCookies(res, accessToken, refreshToken);

    await logAuthEvent(req, {
      actor: { id: user._id, email: user.email, name: user.name, role: 'user' },
      action: 'AUTH_LOGIN',
      status: 'SUCCESS'
    });

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || '',
        contact: user.contact || '',
        role: 'user',
        isProfileComplete: Boolean(user.name && user.contact)
      }
    });
  } catch (error) {
    console.error('Error in user login:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// @desc    Refresh Access Token using Refresh Token cookie
// @route   POST /user/refresh-token
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

    if (decoded.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token role.'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens || !user.refreshTokens.includes(incomingRefreshToken)) {
      clearTokenCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Refresh token is invalid or has been revoked.'
      });
    }

    // Token rotation: replace current refresh token with new one
    const tokenPayload = { id: user._id, email: user.email, role: 'user' };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken({ id: user._id, role: 'user' });

    user.refreshTokens = user.refreshTokens.filter((token) => token !== incomingRefreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

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

// @desc    Log out user & clear cookies
// @route   POST /user/logout
// @access  Public / Authenticated
exports.logout = async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    let actorUser = null;

    if (incomingRefreshToken) {
      actorUser = await User.findOneAndUpdate(
        { refreshTokens: incomingRefreshToken },
        { $pull: { refreshTokens: incomingRefreshToken } }
      );
    }

    if (!actorUser && req.headers?.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (decoded?.id) {
          actorUser = await User.findById(decoded.id);
        }
      } catch (e) {}
    }

    if (!actorUser && (req.body?.email || req.body?.id || req.body?.userId)) {
      const email = req.body.email ? req.body.email.toLowerCase().trim() : undefined;
      const id = req.body.id || req.body.userId;
      actorUser = await User.findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(id ? [{ _id: id }] : [])
        ]
      });
    }

    if (!actorUser && req.user) {
      actorUser = req.user;
    }

    await logAuthEvent(req, {
      actor: {
        id: actorUser?._id,
        email: actorUser?.email || req.body?.email || 'user@yogazen',
        name: actorUser?.name || 'User',
        role: 'user'
      },
      action: 'AUTH_LOGOUT',
      status: 'SUCCESS',
      details: { reason: 'User initiated logout' }
    });

    clearTokenCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error in user logout:', error);
    clearTokenCookies(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out'
    });
  }
};

// @desc    Get current user profile
// @route   GET /user/profile
// @access  Protected
exports.getProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user
  });
};

// @desc    Update current user profile (name, contact)
// @route   PUT /user/profile
// @access  Protected
exports.updateProfile = async (req, res) => {
  try {
    const { name, contact } = req.body;
    const user = req.user;

    if (name !== undefined) user.name = name.trim();
    if (contact !== undefined) user.contact = contact.trim();

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        contact: user.contact,
        addresses: user.addresses,
        enrolledCourses: user.enrolledCourses,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

exports.updatePassword = async (req, res) => {
  res.status(501).json({ message: 'Update password endpoint not yet implemented' });
};

// @desc    Add shipping address
// @route   POST /user/address
// @access  Protected
exports.addAddress = async (req, res) => {
  try {
    const { street, landmark, city, state, country, pincode, contact, isDefault } = req.body;
    const user = req.user;

    if (!street || !city || !state || !pincode || !contact) {
      return res.status(400).json({
        success: false,
        message: 'Street, city, state, pincode, and contact phone are required'
      });
    }

    // If marked default, unset default on other addresses
    if (isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    const newAddress = {
      street: street.trim(),
      landmark: (landmark || '').trim(),
      city: city.trim(),
      state: state.trim(),
      country: (country || 'India').trim(),
      pincode: pincode.trim(),
      contact: contact.trim(),
      isDefault: isDefault || user.addresses.length === 0
    };

    user.addresses.push(newAddress);
    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Address added successfully',
      addresses: user.addresses
    });
  } catch (error) {
    console.error('Error adding address:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: error.message
    });
  }
};

// @desc    Update shipping address
// @route   PUT /user/address/:id
// @access  Protected
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { street, landmark, city, state, country, pincode, contact, isDefault } = req.body;
    const user = req.user;

    const address = user.addresses.id(id);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
      address.isDefault = true;
    } else if (isDefault === false) {
      address.isDefault = false;
    }

    if (street !== undefined) address.street = street.trim();
    if (landmark !== undefined) address.landmark = landmark.trim();
    if (city !== undefined) address.city = city.trim();
    if (state !== undefined) address.state = state.trim();
    if (country !== undefined) address.country = country.trim();
    if (pincode !== undefined) address.pincode = pincode.trim();
    if (contact !== undefined) address.contact = contact.trim();

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      addresses: user.addresses
    });
  } catch (error) {
    console.error('Error updating address:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: error.message
    });
  }
};

// @desc    Delete shipping address
// @route   DELETE /user/address/:id
// @access  Protected
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const address = user.addresses.id(id);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    user.addresses.pull(id);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      addresses: user.addresses
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: error.message
    });
  }
};

exports.getEnrolledCourses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'enrolledCourses.course',
      populate: { path: 'trainer', select: 'name bio categories experienceYears' }
    });

    // Also look for course orders to ensure full consistency across all enrollments
    const courseOrders = await Order.find({
      user: req.user._id,
      orderType: 'course',
      status: { $ne: 'Cancelled' }
    });

    const orderMap = new Map();
    for (const order of courseOrders) {
      if (order.courseDetails?.course) {
        orderMap.set(order.courseDetails.course.toString(), order);
      }
    }

    let enrolledList = (user?.enrolledCourses || [])
      .filter((e) => Boolean(e.course))
      .map((e) => {
        const cId = (e.course?._id || e.course).toString();
        const matchingOrder = orderMap.get(cId);
        const eObj = e.toObject ? e.toObject() : { ...e };
        if (matchingOrder) {
          eObj.orderId = matchingOrder._id;
          eObj.invoiceId = matchingOrder.invoiceId || eObj.invoiceId;
          eObj.progress = matchingOrder.courseProgress?.progressPercentage ?? eObj.progress ?? 0;
          eObj.completedClasses = matchingOrder.courseProgress?.completedClasses || eObj.completedClasses || [];
        }
        return eObj;
      });

    const enrolledCourseIds = new Set(
      enrolledList.map((e) => (e.course?._id || e.course).toString())
    );

    for (const order of courseOrders) {
      const cId = order.courseDetails?.course;
      if (cId && !enrolledCourseIds.has(cId.toString())) {
        const fullCourse = await Course.findById(cId).populate('trainer', 'name bio categories experienceYears');
        if (fullCourse) {
          enrolledList.push({
            course: fullCourse,
            enrolledOn: order.createdAt,
            invoiceId: order.invoiceId,
            orderId: order._id,
            progress: order.courseProgress?.progressPercentage || 0,
            completedClasses: order.courseProgress?.completedClasses || []
          });
          enrolledCourseIds.add(cId.toString());
        }
      }
    }

    return res.status(200).json({
      success: true,
      enrolledCourses: enrolledList
    });
  } catch (error) {
    console.error('Error fetching enrolled courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve enrolled courses',
      error: error.message
    });
  }
};

exports.getInvoice = async (req, res) => {
  res.status(501).json({ message: 'Get invoice endpoint not yet implemented' });
};

exports.deleteProfile = async (req, res) => {
  res.status(501).json({ message: 'Delete profile endpoint not yet implemented' });
};
