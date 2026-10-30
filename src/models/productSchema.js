const mongoose = require('mongoose');

const varietySchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  mrp: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minStockLevel: {
    type: Number,
    default: 10
  },
  warehouseLocation: {
    type: String,
    trim: true,
    default: 'WH-PRAYAG-B2'
  },
  image: {
    type: String,
    trim: true,
    default: ''
  },
  isAvailable: {
    type: Boolean,
    default: true
  }
});

// Virtual for real-time stock alert status per variety
varietySchema.virtual('stockStatus').get(function () {
  if (this.stock <= 0 || !this.isAvailable) return 'OUT_OF_STOCK';
  if (this.stock < 10) return 'LOW_STOCK';
  return 'IN_STOCK';
});

varietySchema.virtual('stockMessage').get(function () {
  if (this.stock <= 0 || !this.isAvailable) return 'Out of stock';
  if (this.stock < 10) return `Only ${this.stock} left in stock`;
  return 'In Stock';
});

varietySchema.set('toJSON', { virtuals: true });
varietySchema.set('toObject', { virtuals: true });

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    discountPrice: {
      type: Number,
      min: 0,
      default: null
    },
    category: {
      type: String,
      trim: true,
      default: 'General Wellness'
    },
    images: [
      {
        type: String,
        trim: true
      }
    ],
    thumbnail: {
      type: String,
      trim: true,
      default: ''
    },
    stock: {
      type: Number,
      default: 0,
      min: 0
    },
    varieties: [varietySchema],
    reviews: [reviewSchema],
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5
    },
    reviewsCount: {
      type: Number,
      default: 0
    },
    isAvailable: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Auto-calculate master stock if varieties exist
productSchema.pre('save', function (next) {
  if (this.varieties && this.varieties.length > 0) {
    this.stock = this.varieties.reduce((acc, v) => acc + (v.stock || 0), 0);
  }
  next();
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);

