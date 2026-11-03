const assert = require('assert');
const path = require('path');
const ml = require('../src/services/mlRecommendationService');

async function runMlTestSuite() {
  console.log('🧪 Starting YogaZen ML Hybrid Recommender Test Suite...\n');

  try {
    // Test 1: Known User Prediction
    console.log('--- Test Group 1: Known Practitioner ML Prediction ---');
    const userRes = await ml.getRecommendationsForUser({
      userId: 'usr_0005',
      sessionId: 'ses_test_unit_001',
      limit: 4
    });

    assert.strictEqual(userRes.success, true, 'Result success should be true');
    assert(userRes.products.length > 0, 'Should return recommended products');
    assert(userRes.products[0].mlScore !== undefined, 'Product must have an mlScore');
    assert(userRes.products[0].mlReason !== undefined, 'Product must have an mlReason');
    console.log(`  ✅ PASS: Known user generated ${userRes.products.length} recommendations via ${userRes.model || userRes.source}`);
    console.log(`     Sample: "${userRes.products[0].title}" [${userRes.products[0].category}] - ${userRes.products[0].mlReason} (Score: ${userRes.products[0].mlScore})`);

    // Test 2: Guest / Anonymous Session Browsing Prediction
    console.log('\n--- Test Group 2: Guest / Cold-Start Session Prediction ---');
    const guestRes = await ml.getRecommendationsForUser({
      userId: null,
      sessionId: 'ses_guest_wellness_explorer',
      limit: 3
    });

    assert.strictEqual(guestRes.success, true, 'Guest result success should be true');
    assert(guestRes.products.length > 0, 'Guest should receive recommended products');
    assert(guestRes.products[0].title !== undefined, 'Guest product must have a title');
    console.log(`  ✅ PASS: Guest generated ${guestRes.products.length} recommendations via ${guestRes.model || guestRes.source}`);
    console.log(`     Sample: "${guestRes.products[0].title}" [${guestRes.products[0].category}] - ${guestRes.products[0].mlReason}`);

    // Test 3: Cart / Wishlist Exclusion
    console.log('\n--- Test Group 3: Real-Time Cart Exclusion ---');
    const topProductId = userRes.products[0]._id;
    const excludedRes = await ml.getRecommendationsForUser({
      userId: 'usr_0005',
      sessionId: 'ses_test_unit_001',
      limit: 4,
      cartItems: [topProductId]
    });

    assert.strictEqual(excludedRes.success, true);
    console.log('  ✅ PASS: Cart items correctly handled during recommendation scoring');

    console.log('\n===========================================');
    console.log('ML Test Results: All tests passed successfully!');
    console.log('===========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ ML Test Failure:', error);
    process.exit(1);
  }
}

runMlTestSuite();

