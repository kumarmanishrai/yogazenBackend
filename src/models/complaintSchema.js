const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true
    },
    orderType: {
      type: String,
      enum: ['product', 'course'],
      required: true
    },
    category: {
      type: String,
      enum: [
        'Damaged / Defective Product',
        'Delivery Delay / Not Received',
        'Wrong Item / Variety Received',
        'Course Video / Stream Issue',
        'Instructor Session Inquiry',
        'Billing / Invoice Discrepancy',
        'Return / Refund Request',
        'Other'
      ],
      required: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium'
    },
    status: {
      type: String,
      enum: ['Pending', 'In Review', 'Resolved', 'Rejected'],
      default: 'Pending'
    },
    adminResponse: {
      type: String,
      trim: true,
      default: ''
    },
    adminNotes: {
      type: String,
      trim: true,
      default: ''
    },
    resolvedAt: {
      type: Date
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);

