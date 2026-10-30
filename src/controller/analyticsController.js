const UserActivity = require('../models/userActivitySchema');
const Product = require('../models/productSchema');

// Event implicit score weights for ML training
const EVENT_WEIGHTS = {
  product_view: (dwellTime) => (dwellTime >= 15 ? 2.5 : 1.0),
  product_click: 2.0,
  variety_select: 2.5,
  add_to_wishlist: 4.0,
  add_to_cart: 6.0,
  purchase: 10.0,
  search: 1.5,
  category_browse: 1.0,
  remove_from_cart: -2.0,
  remove_from_wishlist: -1.5
};

// 1. Ingest single or batched telemetry events from the frontend
exports.trackEvents = async (req, res) => {
  try {
    const userId = req.user?._id || req.body.userId || null;
    const bodyEvents = Array.isArray(req.body.events) ? req.body.events : [req.body];

    if (!bodyEvents || bodyEvents.length === 0) {
      return res.status(400).json({ success: false, message: 'No telemetry events provided.' });
    }

    const formattedEvents = bodyEvents.map((evt) => ({
      userId: userId || evt.userId || null,
      sessionId: evt.sessionId || 'anonymous_session',
      eventType: evt.eventType || 'product_view',
      productId: evt.productId || null,
      productTitle: evt.productTitle || '',
      category: evt.category || '',
      varietySku: evt.varietySku || '',
      varietyName: evt.varietyName || '',
      unitPrice: typeof evt.unitPrice === 'number' ? evt.unitPrice : 0,
      dwellTimeSeconds: typeof evt.dwellTimeSeconds === 'number' ? evt.dwellTimeSeconds : 0,
      sourceComponent: evt.sourceComponent || 'direct',
      searchQuery: evt.searchQuery || '',
      device: evt.device || 'desktop',
      metadata: evt.metadata || {}
    }));

    // High throughput non-blocking insert
    const inserted = await UserActivity.insertMany(formattedEvents, { ordered: false });

    return res.status(201).json({
      success: true,
      message: 'Telemetry events recorded.',
      count: inserted.length
    });
  } catch (error) {
    console.error('Error in analytics trackEvents:', error);
    // Non-blocking response so client is never penalized
    return res.status(500).json({
      success: false,
      message: 'Failed to record events.',
      error: error.message
    });
  }
};

// 2. Export aggregated interaction dataset for your friend's ML Model (JSON or CSV)
exports.exportDataset = async (req, res) => {
  try {
    const { format = 'json', minScore = 0 } = req.query;

    const rawActivities = await UserActivity.find({
      productId: { $ne: null }
    }).lean();

    // Aggregate interaction points by user/session + product
    const matrixMap = new Map();

    rawActivities.forEach((act) => {
      const userIdentifier = act.userId ? `usr_${act.userId}` : `ses_${act.sessionId}`;
      const productKey = act.productId.toString();
      const compositeKey = `${userIdentifier}__${productKey}`;

      let weight = 1.0;
      if (typeof EVENT_WEIGHTS[act.eventType] === 'function') {
        weight = EVENT_WEIGHTS[act.eventType](act.dwellTimeSeconds || 0);
      } else if (typeof EVENT_WEIGHTS[act.eventType] === 'number') {
        weight = EVENT_WEIGHTS[act.eventType];
      }

      if (!matrixMap.has(compositeKey)) {
        matrixMap.set(compositeKey, {
          user_id: userIdentifier,
          product_id: productKey,
          product_title: act.productTitle || '',
          category: act.category || '',
          interaction_score: 0,
          total_views: 0,
          total_clicks: 0,
          in_cart: 0,
          purchased: 0,
          last_interaction: act.createdAt
        });
      }

      const item = matrixMap.get(compositeKey);
      item.interaction_score = Math.round((item.interaction_score + weight) * 10) / 10;
      if (act.eventType === 'product_view') item.total_views += 1;
      if (act.eventType === 'product_click') item.total_clicks += 1;
      if (act.eventType === 'add_to_cart') item.in_cart = 1;
      if (act.eventType === 'purchase') item.purchased = 1;
      if (new Date(act.createdAt) > new Date(item.last_interaction)) {
        item.last_interaction = act.createdAt;
      }
    });

    const dataset = Array.from(matrixMap.values()).filter(
      (entry) => entry.interaction_score >= parseFloat(minScore)
    );

    // CSV format generation if requested
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="yogazen_recommendation_dataset.csv"');

      let csv = 'user_id,product_id,product_title,category,interaction_score,total_views,total_clicks,in_cart,purchased,last_interaction\n';
      dataset.forEach((row) => {
        const cleanTitle = `"${(row.product_title || '').replace(/"/g, '""')}"`;
        const cleanCat = `"${(row.category || '').replace(/"/g, '""')}"`;
        csv += `${row.user_id},${row.product_id},${cleanTitle},${cleanCat},${row.interaction_score},${row.total_views},${row.total_clicks},${row.in_cart},${row.purchased},${row.last_interaction}\n`;
      });

      return res.status(200).send(csv);
    }

    // Default JSON format
    const distinctUsers = new Set(dataset.map((d) => d.user_id)).size;
    const distinctProducts = new Set(dataset.map((d) => d.product_id)).size;

    return res.status(200).json({
      success: true,
      meta: {
        totalInteractions: dataset.length,
        distinctUsers,
        distinctProducts,
        generatedAt: new Date().toISOString(),
        description: 'YogaZen implicit feedback interaction dataset prepared for Collaborative Filtering / Matrix Factorization training.'
      },
      dataset
    });
  } catch (error) {
    console.error('Error in exportDataset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export training dataset.',
      error: error.message
    });
  }
};

// 3. Recommendation Gateway (Safe stub until friend's ML API is ready)
exports.getRecommendations = async (req, res) => {
  try {
    // Check if external ML service is explicitly configured and ready
    const isMlReady = process.env.ENABLE_EXTERNAL_ML === 'true' && Boolean(process.env.ML_SERVICE_URL);

    if (!isMlReady) {
      // Model not prepared yet: strictly do NOT make failing external calls
      return res.status(200).json({
        success: true,
        enabled: false,
        message: 'ML recommendation engine is training / not live yet. Real-time telemetry is accumulating.',
        products: []
      });
    }

    /*
     * WHEN THE FRIEND'S ML MODEL IS HOSTED & READY:
     * Set ENABLE_EXTERNAL_ML=true and ML_SERVICE_URL=https://... in .env
     *
     * Example:
     * const mlResponse = await fetch(`${process.env.ML_SERVICE_URL}/predict`, {
     *   method: 'POST',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ userId: req.user?._id, sessionId: req.query.sessionId })
     * });
     * const { recommendedProductIds } = await mlResponse.json();
     * const products = await Product.find({ _id: { $in: recommendedProductIds } });
     * return res.json({ success: true, enabled: true, products });
     */

    return res.status(200).json({
      success: true,
      enabled: false,
      products: []
    });
  } catch (error) {
    console.error('Error in getRecommendations gateway:', error);
    return res.status(200).json({
      success: true,
      enabled: false,
      products: []
    });
  }
};

