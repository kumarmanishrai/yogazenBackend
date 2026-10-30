const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'product_view',
        'product_click',
        'variety_select',
        'search',
        'category_browse',
        'add_to_cart',
        'remove_from_cart',
        'add_to_wishlist',
        'remove_from_wishlist',
        'purchase'
      ],
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true
    },
    productTitle: {
      type: String,
      trim: true,
      default: ''
    },
    category: {
      type: String,
      trim: true,
      default: ''
    },
    varietySku: {
      type: String,
      trim: true,
      default: ''
    },
    varietyName: {
      type: String,
      trim: true,
      default: ''
    },
    unitPrice: {
      type: Number,
      default: 0
    },
    dwellTimeSeconds: {
      type: Number,
      default: 0,
      min: 0
    },
    sourceComponent: {
      type: String,
      trim: true,
      default: 'direct' // 'home_trending', 'catalog_grid', 'similar_carousel', 'search_results', 'product_detail'
    },
    searchQuery: {
      type: String,
      trim: true,
      default: ''
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'desktop'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Compound index for lightning-fast user/session timeline and matrix aggregation
userActivitySchema.index({ userId: 1, eventType: 1, productId: 1, createdAt: -1 });
userActivitySchema.index({ sessionId: 1, eventType: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);

