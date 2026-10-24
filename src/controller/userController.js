const bcrypt = require('bcryptjs');
const User = require('../models/userSchema');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies
} = require('../helper/generateToken');

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
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
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

    if (incomingRefreshToken) {
      await User.findOneAndUpdate(
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
    console.error('Error in user logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
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

exports.updateProfile = async (req, res) => {
  res.status(501).json({ message: 'Update user profile endpoint not yet implemented' });
};

exports.updatePassword = async (req, res) => {
  res.status(501).json({ message: 'Update password endpoint not yet implemented' });
};

exports.addAddress = async (req, res) => {
  res.status(501).json({ message: 'Add address endpoint not yet implemented' });
};

exports.updateAddress = async (req, res) => {
  res.status(501).json({ message: 'Update address endpoint not yet implemented' });
};

exports.deleteAddress = async (req, res) => {
  res.status(501).json({ message: 'Delete address endpoint not yet implemented' });
};

exports.getEnrolledCourses = async (req, res) => {
  res.status(501).json({ message: 'Get enrolled courses endpoint not yet implemented' });
};

exports.getInvoice = async (req, res) => {
  res.status(501).json({ message: 'Get invoice endpoint not yet implemented' });
};

exports.deleteProfile = async (req, res) => {
  res.status(501).json({ message: 'Delete profile endpoint not yet implemented' });
};
