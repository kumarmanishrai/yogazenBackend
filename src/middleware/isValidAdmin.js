const { verifyAccessToken } = require('../helper/generateToken');
const Admin = require('../models/adminSchema');

// Middleware to authenticate and validate system administrators via JWT
const isValidAdmin = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No admin access token provided.'
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
          message: 'Admin session expired. Please sign in again.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid access token.'
      });
    }

    // Strictly ensure caller has admin or superadmin role
    if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Access restricted exclusively to system administrators.'
      });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin || !admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account not found or is currently deactivated.'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Error in isValidAdmin middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server authentication error.',
      error: error.message
    });
  }
};

module.exports = isValidAdmin;

