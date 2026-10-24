const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  landmark: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, default: 'India' },
  pincode: { type: String, required: true },
  contact: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
});

const enrolledCourseSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  invoiceId: {
    type: String,
    required: true
  },
  amountPaid: {
    type: Number,
    required: true
  }
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: ''
    },
    role: {
      type: String,
      default: 'user'
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
    addresses: [addressSchema],
    enrolledCourses: [enrolledCourseSchema],
    refreshTokens: [
      {
        type: String
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
