const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: {
        type: String,
        default: null,
        index: true
      },
      role: {
        type: String,
        enum: ['superadmin', 'admin', 'trainer', 'user', 'system', 'anonymous'],
        default: 'anonymous',
        index: true
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
      },
      name: {
        type: String,
        trim: true,
        default: ''
      }
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      enum: ['auth', 'rbac', 'admin', 'order', 'inventory', 'trainer', 'security'],
      index: true
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
      index: true
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'DENIED'],
      default: 'SUCCESS',
      index: true
    },
    target: {
      resourceType: {
        type: String,
        trim: true,
        default: ''
      },
      resourceId: {
        type: String,
        default: ''
      },
      resourceName: {
        type: String,
        default: ''
      }
    },
    clientContext: {
      ip: {
        type: String,
        default: '127.0.0.1'
      },
      userAgent: {
        type: String,
        default: ''
      },
      method: {
        type: String,
        default: ''
      },
      endpoint: {
        type: String,
        default: ''
      }
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Compound indexes for optimal filtering & high-frequency lookup
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ 'actor.role': 1, timestamp: -1 });
auditLogSchema.index({ status: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });

// Immutability Hook: Audit records are tamper-proof and strictly append-only
auditLogSchema.pre('updateOne', function (next) {
  next(new Error('Audit logs are append-only and cannot be modified.'));
});
auditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Audit logs are append-only and cannot be modified.'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);

