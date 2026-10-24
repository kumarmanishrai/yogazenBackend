const { verifyAccessToken } = require('../helper/generateToken');
const User = require('../models/userSchema');

// Middleware to authenticate and validate regular users via JWT (Cookies or Header)
const isValidUser = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No access token provided.'
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired. Please refresh your session.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid access token.'
      });
    }

    if (decoded.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Access restricted to regular users.'
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error in isValidUser middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server authentication error.',
      error: error.message
    });
  }
};

module.exports = isValidUser;
