const mongoose = require('mongoose');

const trainerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: ''
    },
    role: {
      type: String,
      default: 'trainer'
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    contact: {
      type: String,
      trim: true
    },
    bio: {
      type: String,
      default: ''
    },
    // Categories/tags for filtering (e.g. Yoga, Meditation, Pranayama, Hatha)
    categories: [
      {
        type: String,
        trim: true
      }
    ],
    experienceYears: {
      type: Number,
      default: 0
    },
    isApproved: {
      type: Boolean,
      default: false // Admin approves trainer before their courses go public
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    commissionRate: {
      type: Number,
      default: 20 // 20% platform commission
    },
    // Payout details to receive course revenue
    payoutDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      upiId: { type: String, trim: true }
    },
    totalEarnings: {
      type: Number,
      default: 0
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
      }
    ],
    refreshTokens: [
      {
        type: String
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trainer', trainerSchema);
