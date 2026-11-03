const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  title: {
    type: String,
    required: true,
    trim: true
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
  varietyImage: {
    type: String,
    trim: true,
    default: ''
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
});

const courseItemSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  trainer: {
    type: String,
    trim: true,
    default: 'YogaZen Master'
  },
  category: {
    type: String,
    trim: true,
    default: 'Yoga & Meditation'
  },
  validity: {
    type: String,
    default: 'Lifetime Access'
  }
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    invoiceId: {
      type: String,
      required: true,
      trim: true
    },
    orderType: {
      type: String,
      enum: ['product', 'course'],
      required: true,
      default: 'product'
    },
    // For physical products
    items: [orderItemSchema],
    shippingAddress: {
      street: { type: String, default: '' },
      landmark: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: 'India' },
      pincode: { type: String, default: '' },
      contact: { type: String, default: '' }
    },
    // For Yoga course orders
    courseDetails: courseItemSchema,
    courseProgress: {
      completedClasses: [{ type: String }],
      progressPercentage: { type: Number, default: 0 }
    },
    subtotal: {
      type: Number,
      default: 0
    },
    couponCode: {
      type: String,
      trim: true,
      default: ''
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    shippingFee: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['Processing', 'Shipped', 'Delivered', 'Active', 'Completed', 'Cancelled'],
      default: 'Processing'
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Pending', 'Failed', 'Refunded'],
      default: 'Paid'
    },
    paymentMethod: {
      type: String,
      default: 'Online / Card / UPI'
    },
    courierName: {
      type: String,
      trim: true,
      default: ''
    },
    trackingNumber: {
      type: String,
      trim: true,
      default: ''
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: ''
    },
    cancelledAt: {
      type: Date
    },
    returnStatus: {
      type: String,
      enum: ['None', 'Requested', 'Approved', 'Rejected', 'Completed'],
      default: 'None'
    },
    returnReason: {
      type: String,
      trim: true,
      default: ''
    },
    returnedAt: {
      type: Date
    },
    deliveredAt: {
      type: Date
    }
  },
  { timestamps: true }
);

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    discountType: {
      type: String,
      enum: ['percent', 'flat', 'shipping'],
      default: 'percent'
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0
    },
    maxDiscount: {
      type: Number,
      default: null
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    usageCount: {
      type: Number,
      default: 0
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);

Order.Coupon = Coupon;
module.exports = Order;

