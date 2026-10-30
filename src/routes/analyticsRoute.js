const express = require('express');
const router = express.Router();
const analyticsController = require('../controller/analyticsController');

// Ingest user telemetry events (anonymous or authenticated)
router.post('/track', analyticsController.trackEvents);

// Data Export for ML Model Training (JSON or CSV)
router.get('/export-dataset', analyticsController.exportDataset);

// Safe Recommendation Gateway
router.get('/recommendations', analyticsController.getRecommendations);

module.exports = router;

