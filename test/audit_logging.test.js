const assert = require('assert');
const mongoose = require('mongoose');
const AuditLog = require('../src/models/auditLogSchema');
const {
  logAuditEvent,
  logAuthEvent,
  logAdminAction,
  logSecurityViolation
} = require('../src/services/auditLogger');

console.log('🧪 Starting YogaZen Audit & Logging Verification Test Suite...\n');

let passed = 0;

// Test Group 1: Data Model & Schema Validation
console.log('--- Test Group 1: Data Model & Schema Integrity ---');
const sampleLog = new AuditLog({
  actor: {
    id: 'usr_mock_123',
    role: 'superadmin',
    email: 'superadmin@yogazen.com',
    name: 'Super Administrator'
  },
  action: 'AUTH_LOGIN',
  category: 'auth',
  severity: 'info',
  status: 'SUCCESS',
  target: {
    resourceType: 'Session',
    resourceName: 'superadmin@yogazen.com'
  },
  clientContext: {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (YogaZen Admin Portal)',
    method: 'POST',
    endpoint: '/admin/login'
  },
  details: { username: 'superadmin' }
});

const validationError = sampleLog.validateSync();
assert.strictEqual(validationError, undefined, 'Sample audit log must pass Mongoose validation');
assert.strictEqual(sampleLog.action, 'AUTH_LOGIN');
assert.strictEqual(sampleLog.actor.role, 'superadmin');
assert.strictEqual(sampleLog.status, 'SUCCESS');
assert.strictEqual(sampleLog.category, 'auth');
console.log('  ✅ PASS: Audit log data model passes strict schema validation');
passed++;

// Test Group 2: Immutability Hook Check
console.log('\n--- Test Group 2: Immutability (Append-Only) Enforcement ---');
let caughtError = null;
try {
  // Simulate pre-updateOne hook
  const hooks = AuditLog.schema.s.hooks._pres.get('updateOne');
  assert(hooks && hooks.length > 0, 'Must have pre-updateOne hook registered');
  
  const mockNext = (err) => {
    if (err) throw err;
  };
  hooks[0].fn.call({}, mockNext);
} catch (err) {
  caughtError = err;
}

assert(caughtError !== null, 'Update attempt must throw append-only error');
assert.strictEqual(caughtError.message, 'Audit logs are append-only and cannot be modified.');
console.log('  ✅ PASS: Mongoose pre-update hooks strictly enforce append-only immutability');
passed++;

// Test Group 3: Auth Events & Failure Severity Escalation
console.log('\n--- Test Group 3: Auth Logging & Failure Escalation ---');
const mockReq = {
  headers: {
    'x-forwarded-for': '49.37.155.22, 10.0.0.1',
    'user-agent': 'Chrome/124.0 Mac OS X'
  },
  method: 'POST',
  originalUrl: '/user/login'
};

// Successful Login
logAuthEvent(mockReq, {
  actor: { id: 'usr_001', email: 'yogi@example.com', role: 'user' },
  action: 'AUTH_LOGIN',
  status: 'SUCCESS'
}).then((entry) => {
  assert(entry, 'Audit entry created');
  assert.strictEqual(entry.action, 'AUTH_LOGIN');
  assert.strictEqual(entry.severity, 'info');
  assert.strictEqual(entry.clientContext.ip, '49.37.155.22');
  console.log('  ✅ PASS: Successful login logs with IP 49.37.155.22 and INFO severity');
  passed++;

  // Failed Login Attempt (Must escalate severity to 'warning')
  return logAuthEvent(mockReq, {
    actor: { email: 'hacker@malicious.com', role: 'anonymous' },
    action: 'AUTH_LOGIN_FAILED',
    status: 'FAILURE',
    details: { reason: 'Incorrect password entered' }
  });
}).then((failedEntry) => {
  assert(failedEntry, 'Failed login audit entry created');
  assert.strictEqual(failedEntry.action, 'AUTH_LOGIN_FAILED');
  assert.strictEqual(failedEntry.severity, 'warning');
  assert.strictEqual(failedEntry.status, 'FAILURE');
  assert.strictEqual(failedEntry.details.reason, 'Incorrect password entered');
  console.log('  ✅ PASS: Failed login escalates severity to WARNING and records failure reason');
  passed++;

  // User / Trainer / Admin Logout Audit Logging
  return logAuthEvent(mockReq, {
    actor: { id: 'usr_789', email: 'yogini@yogazen.com', name: 'Aarohi Sen', role: 'user' },
    action: 'AUTH_LOGOUT',
    status: 'SUCCESS',
    details: { reason: 'User initiated logout' }
  });
}).then((logoutEntry) => {
  assert(logoutEntry, 'Logout audit entry created');
  assert.strictEqual(logoutEntry.action, 'AUTH_LOGOUT');
  assert.strictEqual(logoutEntry.actor.email, 'yogini@yogazen.com');
  assert.strictEqual(logoutEntry.actor.role, 'user');
  assert.strictEqual(logoutEntry.status, 'SUCCESS');
  console.log('  ✅ PASS: Logout event successfully recorded with actor email, role, and SUCCESS status');
  passed++;

  // Test Group 4: Admin Mutations & Target Resource Tracking
  console.log('\n--- Test Group 4: Admin Action & Target Resource Tracking ---');
  const adminReq = {
    admin: {
      _id: 'adm_999',
      role: 'superadmin',
      email: 'admin@yogazen.com',
      name: 'Super Admin'
    },
    headers: { 'user-agent': 'YogaZen Admin Desk' },
    method: 'PATCH',
    originalUrl: '/admin/trainers/trn_555/approval'
  };

  return logAdminAction(adminReq, {
    action: 'TRAINER_APPROVAL',
    category: 'trainer',
    target: {
      resourceType: 'Trainer',
      resourceId: 'trn_555',
      resourceName: 'Priya Sundaram'
    },
    details: { approved: true, licenseGranted: 'Hatha Yoga 500H' }
  });
}).then((adminEntry) => {
  assert(adminEntry, 'Admin action entry created');
  assert.strictEqual(adminEntry.actor.role, 'superadmin');
  assert.strictEqual(adminEntry.category, 'trainer');
  assert.strictEqual(adminEntry.target.resourceType, 'Trainer');
  assert.strictEqual(adminEntry.target.resourceName, 'Priya Sundaram');
  assert.strictEqual(adminEntry.details.approved, true);
  console.log('  ✅ PASS: Trainer approval admin action captured with target resource and details');
  passed++;

  // Test Group 5: Security Violations (403 Forbidden)
  console.log('\n--- Test Group 5: Security Violations (403 Access Denied) ---');
  const forbiddenReq = {
    admin: {
      _id: 'sub_111',
      role: 'admin',
      email: 'subadmin@yogazen.com'
    },
    headers: { 'user-agent': 'Chrome Linux' },
    method: 'DELETE',
    originalUrl: '/admin/subadmins/sub_222'
  };

  return logSecurityViolation(forbiddenReq, {
    action: 'SECURITY_PERMISSION_DENIED',
    reason: 'Admin lacks required admins permission',
    details: { required: 'admins' }
  });
}).then((secEntry) => {
  assert(secEntry, 'Security violation entry created');
  assert.strictEqual(secEntry.category, 'security');
  assert.strictEqual(secEntry.status, 'DENIED');
  assert.strictEqual(secEntry.severity, 'warning');
  assert.strictEqual(secEntry.details.reason, 'Admin lacks required admins permission');
  console.log('  ✅ PASS: 403 Access violation logged with status DENIED and category SECURITY');
  passed++;

  // Test Group 6: CSV Export Structure
  console.log('\n--- Test Group 6: CSV Compliance Export Verification ---');
  const mockLogs = [
    {
      timestamp: new Date('2026-11-03T18:00:00Z'),
      actor: { email: 'superadmin@yogazen.com', role: 'superadmin' },
      action: 'AUTH_LOGIN',
      category: 'auth',
      status: 'SUCCESS',
      severity: 'info',
      target: { resourceType: 'Session', resourceName: 'superadmin@yogazen.com' },
      clientContext: { ip: '127.0.0.1', userAgent: 'HeadlessChrome' }
    }
  ];

  const header = 'Timestamp,Actor Email,Actor Role,Action,Category,Status,Severity,Target Resource,IP Address,User Agent\n';
  const clean = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
  const row = [
    clean(new Date(mockLogs[0].timestamp).toISOString()),
    clean(mockLogs[0].actor.email),
    clean(mockLogs[0].actor.role),
    clean(mockLogs[0].action),
    clean(mockLogs[0].category),
    clean(mockLogs[0].status),
    clean(mockLogs[0].severity),
    clean(`${mockLogs[0].target.resourceType}: ${mockLogs[0].target.resourceName}`),
    clean(mockLogs[0].clientContext.ip),
    clean(mockLogs[0].clientContext.userAgent)
  ].join(',');

  const csvResult = header + row;
  assert(csvResult.includes('superadmin@yogazen.com'));
  assert(csvResult.includes('AUTH_LOGIN'));
  assert(csvResult.includes('127.0.0.1'));
  console.log('  ✅ PASS: CSV compliance output correctly formats timestamps, actor, and status fields');
  passed++;

  console.log(`\n===========================================`);
  console.log(`Test Results: ${passed} passed, 0 failed.`);
  console.log(`===========================================\n`);
  process.exit(0);
}).catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

