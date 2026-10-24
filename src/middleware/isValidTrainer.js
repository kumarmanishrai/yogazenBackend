const { verifyAccessToken } = require('../helper/generateToken');
const Trainer = require('../models/trainerSchema');

// Middleware to authenticate and validate trainers via JWT (Cookies or Header)
const isValidTrainer = async (req, res, next) => {
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

    if (decoded.role !== 'trainer') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Access restricted to trainers.'
      });
    }

    const trainer = await Trainer.findById(decoded.id).select('-password');
    if (!trainer) {
      return res.status(401).json({
        success: false,
        message: 'Trainer account not found.'
      });
    }

    req.trainer = trainer;
    next();
  } catch (error) {
    console.error('Error in isValidTrainer middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server authentication error.',
      error: error.message
    });
  }
};

module.exports = isValidTrainer;
