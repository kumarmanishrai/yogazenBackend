const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
const Product = require('../models/productSchema');
const UserActivity = require('../models/userActivitySchema');

// Path constants
const ML_PROJECT_DIR = path.resolve(
  __dirname,
  '../../../YogaZen-Recommendation-System/extracted/YogaZen_Recommendation_Project'
);
const PYLIBS_DIR = path.resolve(
  __dirname,
  '../../../YogaZen-Recommendation-System/pylibs'
);
const PREDICT_RUNNER = path.join(ML_PROJECT_DIR, 'predict_runner.py');
const PRODUCTS_CSV = path.join(ML_PROJECT_DIR, 'data/products.csv');

// In-memory cache for synthetic product catalogue from ML training data
let mlCatalogCache = new Map();

function loadMlCatalog() {
  if (mlCatalogCache.size > 0) return mlCatalogCache;
  try {
    if (fs.existsSync(PRODUCTS_CSV)) {
      const content = fs.readFileSync(PRODUCTS_CSV, 'utf-8');
      const lines = content.split('\n');
      // header: product_id,product_title,category,price,brand,description
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 3) {
          const pid = parts[0].trim();
          const title = parts[1].trim();
          const category = parts[2].trim();
          const price = parseFloat(parts[3]) || 0;
          mlCatalogCache.set(pid, {
            product_id: pid,
            product_title: title,
            category,
            price
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not preload ML products CSV catalog:', err.message);
  }
  return mlCatalogCache;
}

// Initial preload
loadMlCatalog();

/**
 * Invoke the Python ML Hybrid Recommender model via predict_runner.py
 */
function invokePythonPredictor(payload) {
  try {
    if (!fs.existsSync(PREDICT_RUNNER)) {
      throw new Error(`ML predict_runner not found at ${PREDICT_RUNNER}`);
    }

    const runnerEnv = {
      ...process.env,
      PYTHONPATH: fs.existsSync(PYLIBS_DIR)
        ? `${PYLIBS_DIR}:${process.env.PYTHONPATH || ''}`
        : process.env.PYTHONPATH || ''
    };

    const runResult = spawnSync('python3', [PREDICT_RUNNER], {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
      env: runnerEnv,
      timeout: 6000 // 6-second safety timeout
    });

    if (runResult.error) {
      throw runResult.error;
    }

    if (runResult.status !== 0) {
      throw new Error(
        runResult.stderr
          ? runResult.stderr.trim()
          : `Python process exited with code ${runResult.status}`
      );
    }

    const parsed = JSON.parse(runResult.stdout.trim());
    return parsed;
  } catch (err) {
    console.warn('Python ML predictor invocation fallback:', err.message);
    return null;
  }
}

/**
 * Hydrate recommended product identifiers into actual MongoDB Product documents
 */
async function hydrateRecommendations(rawRecommendations, limit = 6) {
  const catalog = loadMlCatalog();
  const hydratedProducts = [];
  const seenIds = new Set();

  const isDbConnected = mongoose.connection.readyState === 1;

  for (const rec of rawRecommendations) {
    if (hydratedProducts.length >= limit) break;
    const pid = rec.product_id;
    const mlMeta = catalog.get(pid);

    let dbProduct = null;

    if (isDbConnected) {
      // 1. Try finding by direct MongoDB ObjectId if valid
      if (mongoose.Types.ObjectId.isValid(pid)) {
        dbProduct = await Product.findById(pid).lean();
      }

      // 2. Try finding by matching title from ML catalog
      if (!dbProduct && mlMeta && mlMeta.product_title) {
        const cleanTitle = mlMeta.product_title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        dbProduct = await Product.findOne({
          title: { $regex: new RegExp(cleanTitle, 'i') }
        }).lean();
      }

      // 3. Try finding in matching category from ML catalog
      if (!dbProduct && mlMeta && mlMeta.category) {
        dbProduct = await Product.findOne({
          _id: { $nin: Array.from(seenIds) },
          category: { $regex: new RegExp(`^${mlMeta.category.trim()}$`, 'i') }
        }).lean();
      }
    }

    // If a database product was found and hasn't been added yet
    if (dbProduct && !seenIds.has(dbProduct._id.toString())) {
      seenIds.add(dbProduct._id.toString());
      hydratedProducts.push({
        ...dbProduct,
        mlScore: rec.score || 0.85,
        mlReason: rec.reason || `Recommended for you in ${dbProduct.category}`,
        matchCategory: mlMeta ? mlMeta.category : dbProduct.category
      });
    }
  }

  // If database products returned were fewer than limit, backfill with in-stock products
  if (isDbConnected && hydratedProducts.length < limit) {
    const fillerProducts = await Product.find({
      _id: { $nin: Array.from(seenIds) }
    })
      .sort({ rating: -1, stock: -1 })
      .limit(limit - hydratedProducts.length)
      .lean();

    fillerProducts.forEach((p) => {
      seenIds.add(p._id.toString());
      hydratedProducts.push({
        ...p,
        mlScore: 0.75,
        mlReason: `Popular in ${p.category} with wellness enthusiasts`,
        matchCategory: p.category
      });
    });
  }

  // Backfill from ML catalog if still fewer than limit
  if (hydratedProducts.length < limit) {
    for (const rec of rawRecommendations) {
      if (hydratedProducts.length >= limit) break;
      const pid = rec.product_id;
      if (seenIds.has(pid)) continue;
      const mlMeta = catalog.get(pid);
      if (mlMeta) {
        seenIds.add(pid);
        hydratedProducts.push({
          _id: pid,
          title: mlMeta.product_title,
          category: mlMeta.category,
          price: mlMeta.price,
          rating: 4.8,
          reviewsCount: 16,
          thumbnail: '',
          mlScore: rec.score || 0.85,
          mlReason: rec.reason || `Recommended based on ${mlMeta.category}`,
          matchCategory: mlMeta.category
        });
      }
    }
  }

  return hydratedProducts;
}

/**
 * Primary public recommendation function for YogaZen
 */
exports.getRecommendationsForUser = async ({
  userId = null,
  sessionId = 'anonymous_session',
  limit = 6,
  cartItems = [],
  wishlistItems = []
} = {}) => {
  try {
    // 1. Fetch recent telemetry interactions from MongoDB UserActivity
    let recentInteractions = [];
    const query = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.$or = [{ userId: new mongoose.Types.ObjectId(userId) }, { sessionId }];
    } else if (sessionId) {
      query.sessionId = sessionId;
    }

    if (mongoose.connection.readyState === 1) {
      const recentActivities = await UserActivity.find(query)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      recentInteractions = recentActivities.map((act) => ({
        product_id: act.productId ? act.productId.toString() : '',
        product_title: act.productTitle || '',
        category: act.category || '',
        event_type: act.eventType || 'product_view',
        dwell_time_seconds: act.dwellTimeSeconds || 0,
        variety_sku: act.varietySku || '',
        price: act.unitPrice || 0
      }));
    }

    // 2. Prepare request payload matching ML project PredictRequest specification
    let mlUserId = null;
    if (userId) {
      mlUserId = String(userId).startsWith('usr_') ? String(userId) : `usr_${userId}`;
    }

    const predictPayload = {
      user_context: {
        user_id: mlUserId,
        session_id: sessionId,
        is_guest: !Boolean(userId)
      },
      recent_interactions: recentInteractions,
      current_state: {
        cart_items: (cartItems || []).map((id) => id.toString()),
        wishlist_items: (wishlistItems || []).map((id) => id.toString())
      },
      limit
    };

    // 3. Attempt prediction via Python Hybrid Recommender
    let mlResponse = invokePythonPredictor(predictPayload);

    // If external ML server is running at ML_SERVICE_URL, allow remote override
    if (!mlResponse && process.env.ENABLE_EXTERNAL_ML === 'true' && process.env.ML_SERVICE_URL) {
      try {
        const fetchRes = await fetch(`${process.env.ML_SERVICE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(predictPayload)
        });
        if (fetchRes.ok) {
          mlResponse = await fetchRes.json();
        }
      } catch (e) {
        console.warn('External ML service fetch error:', e.message);
      }
    }

    // 4. Hydrate products from the ML response
    if (mlResponse && mlResponse.recommendations && mlResponse.recommendations.length > 0) {
      const products = await hydrateRecommendations(mlResponse.recommendations, limit);
      return {
        success: true,
        source: 'yogazen_hybrid_ml_model',
        model: 'TruncatedSVD + TF-IDF Hybrid (65/35)',
        count: products.length,
        products
      };
    }

    // 5. Native Fallback Recommender (Category affinity & rating)
    const categoryCount = {};
    recentInteractions.forEach((i) => {
      if (i.category) {
        categoryCount[i.category] = (categoryCount[i.category] || 0) + 1;
      }
    });

    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0];

    let fallbackQuery = {};
    if (topCategory) {
      fallbackQuery.category = { $regex: new RegExp(`^${topCategory}$`, 'i') };
    }

    let products = [];
    if (mongoose.connection.readyState === 1) {
      products = await Product.find(fallbackQuery)
        .sort({ rating: -1, stock: -1 })
        .limit(limit)
        .lean();

      if (products.length === 0) {
        products = await Product.find({})
          .sort({ rating: -1, stock: -1 })
          .limit(limit)
          .lean();
      }
    }

    return {
      success: true,
      source: 'telemetry_affinity_engine',
      model: 'Category Affinity + Interaction Weighting',
      count: products.length,
      products: products.map((p) => ({
        ...p,
        mlScore: 0.8,
        mlReason: topCategory
          ? `Selected based on your interest in ${topCategory}`
          : 'Trending favorite among YogaZen community',
        matchCategory: p.category
      }))
    };
  } catch (error) {
    console.error('Error in getRecommendationsForUser:', error);
    // Safe graceful empty fallback
    return {
      success: true,
      source: 'safe_fallback',
      count: 0,
      products: []
    };
  }
};
