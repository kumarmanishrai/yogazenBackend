const { verifyAccessToken } = require('../helper/generateToken');
const Admin = require('../models/adminSchema');
const { logSecurityViolation } = require('../services/auditLogger');

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
      logSecurityViolation(req, {
        action: 'SECURITY_ACCESS_DENIED',
        reason: 'Forbidden: non-administrative caller attempted access to admin endpoint',
        details: { attemptedRole: decoded.role, userId: decoded.id }
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Access restricted exclusively to system administrators.'
      });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin || !admin.isActive) {
      logSecurityViolation(req, {
        action: 'SECURITY_DEACTIVATED_ACCOUNT_ACCESS',
        reason: 'Attempted access with deactivated or deleted admin account',
        details: { adminId: decoded.id }
      });
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

// Middleware to enforce specific role permissions (Superadmin bypasses all checks)
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Admin profile missing.'
      });
    }

    // Superadmin has absolute unrestricted access to every administrative capability
    if (req.admin.role === 'superadmin') {
      return next();
    }

    const perms = Array.isArray(req.admin.permissions) ? req.admin.permissions : [];
    if (perms.includes('all') || perms.includes(permission)) {
      return next();
    }

    logSecurityViolation(req, {
      action: 'SECURITY_PERMISSION_DENIED',
      reason: `Admin lacks required '${permission}' permission`,
      details: { requiredPermission: permission, grantedPermissions: perms }
    });

    return res.status(403).json({
      success: false,
      message: `Access denied. Your admin account lacks the '${permission}' permission.`
    });
  };
};

isValidAdmin.isValidAdmin = isValidAdmin;
isValidAdmin.requirePermission = requirePermission;

module.exports = isValidAdmin;

