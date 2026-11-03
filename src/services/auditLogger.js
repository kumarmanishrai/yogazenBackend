const AuditLog = require('../models/auditLogSchema');
const mongoose = require('mongoose');

/**
 * Extract caller IP from request, supporting proxies and CDNs
 */
const extractIp = (req) => {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

/**
 * Core logging method. Runs non-blocking to ensure fast API response times.
 */
const logAuditEvent = async (req, eventData = {}) => {
  try {
    const ip = extractIp(req);
    const userAgent = req?.headers ? (req.headers['user-agent'] || 'Unknown') : 'Unknown';
    const method = req?.method || '';
    const endpoint = req?.originalUrl || req?.url || '';

    const actor = {
      id: eventData.actor?.id ? String(eventData.actor.id) : null,
      role: eventData.actor?.role || 'anonymous',
      email: (eventData.actor?.email || '').toLowerCase().trim(),
      name: eventData.actor?.name || ''
    };

    const auditEntry = new AuditLog({
      actor,
      action: eventData.action,
      category: eventData.category || 'auth',
      severity: eventData.severity || 'info',
      status: eventData.status || 'SUCCESS',
      target: {
        resourceType: eventData.target?.resourceType || '',
        resourceId: eventData.target?.resourceId ? String(eventData.target.resourceId) : '',
        resourceName: eventData.target?.resourceName || ''
      },
      clientContext: {
        ip,
        userAgent,
        method,
        endpoint
      },
      details: eventData.details || {},
      timestamp: new Date()
    });

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await auditEntry.save();
    }
    return auditEntry;
  } catch (error) {
    // Fail silently in production to avoid crashing primary transaction, but log warning
    console.warn('⚠️ [AuditLogger] Failed to write audit record:', error.message);
    return null;
  }
};

/**
 * Helper to log Authentication lifecycle events (Logins, Failed Logins, Logouts, Registration)
 */
const logAuthEvent = (req, { actor, action, status = 'SUCCESS', details = {}, severity = 'info' }) => {
  return logAuditEvent(req, {
    actor,
    action,
    category: 'auth',
    severity: status === 'FAILURE' ? 'warning' : severity,
    status,
    target: {
      resourceType: 'Session',
      resourceName: actor?.email || actor?.username || 'Session'
    },
    details
  });
};

/**
 * Helper to log Admin / Staff Actions (Trainer Approvals, Orders, Inventory, Financials)
 */
const logAdminAction = (req, { action, category = 'admin', target = {}, details = {}, severity = 'info', status = 'SUCCESS' }) => {
  const actor = {
    id: req?.admin?._id,
    role: req?.admin?.role || 'admin',
    email: req?.admin?.email,
    name: req?.admin?.name || req?.admin?.username
  };

  return logAuditEvent(req, {
    actor,
    action,
    category,
    severity,
    status,
    target,
    details
  });
};

/**
 * Helper to log Security & RBAC Access Violations (401, 403, Deactivated accounts)
 */
const logSecurityViolation = (req, { action = 'SECURITY_ACCESS_DENIED', reason, details = {} }) => {
  const actor = {
    id: req?.admin?._id || req?.user?._id || req?.trainer?._id || null,
    role: req?.admin?.role || req?.user?.role || req?.trainer?.role || 'anonymous',
    email: req?.admin?.email || req?.user?.email || req?.trainer?.email || '',
    name: req?.admin?.name || req?.user?.name || req?.trainer?.name || ''
  };

  return logAuditEvent(req, {
    actor,
    action,
    category: 'security',
    severity: 'warning',
    status: 'DENIED',
    target: {
      resourceType: 'API_Route',
      resourceName: req?.originalUrl || req?.url || 'Protected Endpoint'
    },
    details: {
      reason,
      ...details
    }
  });
};

module.exports = {
  logAuditEvent,
  logAuthEvent,
  logAdminAction,
  logSecurityViolation
};
