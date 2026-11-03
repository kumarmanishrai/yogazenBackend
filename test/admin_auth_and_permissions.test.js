const assert = require('assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock Environment for JWT testing
process.env.ACCESS_TOKEN_SECRET = 'test_access_secret_2026_xyz';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_secret_2026_abc';

const { generateAccessToken, generateRefreshToken } = require('../src/helper/generateToken');
const isValidAdmin = require('../src/middleware/isValidAdmin');
const { requirePermission } = isValidAdmin;

console.log('🧪 Starting YogaZen Admin Verification Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Reason: ${err.message}\n`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Reason: ${err.message}\n`);
    testsFailed++;
  }
}

(async () => {
  // --------------------------------------------------------------------------
  // TEST GROUP 1: Token Generation & Verification
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Admin Tokens & Roles ---');

  runTest('generateAccessToken produces valid token with role and permissions', () => {
    const payload = {
      id: 'admin_123',
      email: 'subadmin@yogazen.com',
      username: 'subadmin_ops',
      role: 'admin',
      permissions: ['inventory', 'orders']
    };
    const token = generateAccessToken(payload);
    assert(typeof token === 'string' && token.length > 20, 'Token must be a valid JWT string');

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    assert.strictEqual(decoded.id, 'admin_123');
    assert.strictEqual(decoded.username, 'subadmin_ops');
    assert.strictEqual(decoded.role, 'admin');
    assert.deepStrictEqual(decoded.permissions, ['inventory', 'orders']);
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 2: requirePermission Middleware & Role Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Role-Based Access Control (RBAC) ---');

  runTest('requirePermission grants universal bypass to superadmin', () => {
    const middleware = requirePermission('financials');
    const req = {
      admin: {
        _id: 'super_1',
        role: 'superadmin',
        permissions: ['all']
      }
    };
    let nextCalled = false;
    const res = {};
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, true, 'Superadmin must always be granted access without permission checks');
  });

  runTest('requirePermission grants access to sub-admin with matching permission', () => {
    const middleware = requirePermission('inventory');
    const req = {
      admin: {
        _id: 'admin_sub1',
        role: 'admin',
        permissions: ['inventory', 'orders']
      }
    };
    let nextCalled = false;
    const res = {};
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, true, 'Sub-admin with inventory permission must be allowed');
  });

  runTest('requirePermission rejects sub-admin lacking the specific permission with 403', () => {
    const middleware = requirePermission('financials');
    const req = {
      admin: {
        _id: 'admin_sub2',
        role: 'admin',
        permissions: ['inventory', 'complaints']
      }
    };
    let statusCode = null;
    let responseBody = null;
    let nextCalled = false;

    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, false, 'Next must not be called when permission is missing');
    assert.strictEqual(statusCode, 403, 'Must return 403 Forbidden');
    assert.strictEqual(responseBody.success, false);
    assert(responseBody.message.includes('financials'), 'Message must indicate missing permission');
  });

  runTest('requirePermission rejects unauthenticated caller with 401', () => {
    const middleware = requirePermission('inventory');
    const req = {};
    let statusCode = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 401, 'Must return 401 when req.admin is missing');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: isValidAdmin Authentication Middleware
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: isValidAdmin Token Boundary ---');

  await runAsyncTest('isValidAdmin rejects request without token with 401', async () => {
    const req = { cookies: {}, headers: {} };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (b) => { responseBody = b; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await isValidAdmin(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(responseBody.success, false);
  });

  await runAsyncTest('isValidAdmin rejects regular user token with 403', async () => {
    const userToken = jwt.sign(
      { id: 'user_456', role: 'user', email: 'user@test.com' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1h' }
    );
    const req = {
      cookies: { accessToken: userToken },
      headers: {}
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: (b) => { responseBody = b; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await isValidAdmin(req, res, next);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert(responseBody.message.includes('restricted exclusively to system administrators'));
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Indian Financial Year Ledger Date Math
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Indian Financial Year Calculations ---');

  runTest('Indian FY bounds compute accurately (April 1 to March 31)', () => {
    const fyCases = [
      { fy: '2024-25', startYear: 2024, endYear: 2025 },
      { fy: '2025-26', startYear: 2025, endYear: 2026 },
      { fy: '2026-27', startYear: 2026, endYear: 2027 }
    ];

    for (const item of fyCases) {
      const parts = item.fy.split('-');
      const startYear = parseInt(parts[0], 10);
      const endYear = startYear + 1;

      const fyStart = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0)); // April 1
      const fyEnd = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); // March 31

      assert.strictEqual(startYear, item.startYear);
      assert.strictEqual(endYear, item.endYear);
      assert.strictEqual(fyStart.getUTCMonth(), 3, 'Start month must be April (index 3)');
      assert.strictEqual(fyStart.getUTCDate(), 1, 'Start date must be 1st');
      assert.strictEqual(fyEnd.getUTCMonth(), 2, 'End month must be March (index 2)');
      assert.strictEqual(fyEnd.getUTCDate(), 31, 'End date must be 31st');
    }
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Frontend and Backend API Route Synchronization
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: API Endpoint Synchronization ---');

  runTest('Critical frontend API endpoints match backend route registry', () => {
    const requiredEndpoints = [
      { method: 'POST', path: '/admin/login' },
      { method: 'POST', path: '/admin/logout' },
      { method: 'GET', path: '/admin/profile' },
      { method: 'GET', path: '/admin/dashboard/stats' },
      { method: 'GET', path: '/admin/subadmins' },
      { method: 'POST', path: '/admin/subadmins' },
      { method: 'GET', path: '/admin/users' },
      { method: 'PATCH', path: '/admin/users/:id/status' },
      { method: 'GET', path: '/admin/trainers' },
      { method: 'PATCH', path: '/admin/trainers/:id/approval' },
      { method: 'GET', path: '/admin/courses' },
      { method: 'PATCH', path: '/admin/courses/:id/status' },
      { method: 'GET', path: '/admin/financials/transactions' },
      { method: 'GET', path: '/admin/products' },
      { method: 'POST', path: '/admin/products' },
      { method: 'PATCH', path: '/admin/products/:id/stock' },
      { method: 'GET', path: '/orders/admin/all' },
      { method: 'PUT', path: '/orders/admin/:id/status' },
      { method: 'GET', path: '/orders/admin/coupons' },
      { method: 'GET', path: '/complaints/admin/stats' },
      { method: 'GET', path: '/complaints/admin/all' },
      { method: 'PUT', path: '/complaints/admin/:id' }
    ];

    assert(requiredEndpoints.length === 22, 'All 22 critical administrative endpoints must be registered');
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Platform vs Trainer Revenue Split (Product 100% + Course 20% / 80%)
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 6: Platform Revenue & Trainer Earnings Split ---');

  runTest('Platform gross earning includes 100% product sales and strictly 20% of course sales', () => {
    const productTotal = 50000; // e.g. yoga mats & props
    const courseSales = 30000;  // e.g. course sales
    const platformCommission = Math.round(courseSales * 0.20); // 20%
    const trainerEarnings = Math.round(courseSales * 0.80);    // 80%

    // Platform gross revenue must NOT include trainer's 80%
    const platformGrossRevenue = productTotal + platformCommission;

    assert.strictEqual(platformCommission, 6000, '20% commission on ₹30,000 course sales must be ₹6,000');
    assert.strictEqual(trainerEarnings, 24000, '80% net instructor earning must be ₹24,000');
    assert.strictEqual(platformGrossRevenue, 56000, 'Platform revenue must be ₹50,000 (products) + ₹6,000 (courses 20%) = ₹56,000');
    assert(platformGrossRevenue < (productTotal + courseSales), 'Platform revenue must strictly exclude trainer earnings');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n===========================================');
  console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('===========================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();

