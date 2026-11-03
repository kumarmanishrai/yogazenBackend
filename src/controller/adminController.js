const Admin = require('../models/adminSchema');
const Trainer = require('../models/trainerSchema');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');
const Course = require('../models/courseSchema');
const Order = require('../models/orderSchema');
const Complaint = require('../models/complaintSchema');
const UserActivity = require('../models/userActivitySchema');
const AuditLog = require('../models/auditLogSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearTokenCookies
} = require('../helper/generateToken');
const {
  logAuthEvent,
  logAdminAction,
  logSecurityViolation
} = require('../services/auditLogger');

// ==========================================
// --- Admin Authentication & Session ---
// ==========================================

// @desc    Admin & Superadmin Login (Preset: 654321 for Superadmin)
// @route   POST /admin/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body;
    const loginKey = (identifier || username || email || '').trim().toLowerCase();
    const inputPassword = (password || '').trim();

    if (!loginKey || !inputPassword) {
      return res.status(400).json({
        success: false,
        message: 'Username/Email and password are required'
      });
    }

    // 1. Superadmin Preset Login Support
    const isSuperAdminIdentifier = loginKey === 'superadmin' || loginKey === 'superadmin@yogazen.com' || loginKey === 'admin@yogazen.store';
    let admin = await Admin.findOne({
      $or: [{ username: loginKey }, { email: loginKey }, ...(isSuperAdminIdentifier ? [{ role: 'superadmin' }] : [])]
    });

    if (isSuperAdminIdentifier && inputPassword === '654321') {
      // Guaranteed superadmin entry
      if (!admin) {
        const hashedPreset = await bcrypt.hash('654321', 10);
        admin = await Admin.create({
          name: 'Chief Super Administrator',
          username: 'superadmin',
          email: 'superadmin@yogazen.com',
          password: hashedPreset,
          role: 'superadmin',
          permissions: ['all', 'inventory', 'complaints', 'orders', 'crm', 'trainers', 'financials', 'admins', 'audit'],
          isActive: true
        });
      }
    } else {
      if (!admin) {
        logAuthEvent(req, {
          actor: { email: loginKey, role: isSuperAdminIdentifier ? 'superadmin' : 'admin' },
          action: 'AUTH_LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'warning',
          details: { reason: 'Invalid administrative credentials: user not found', identifier: loginKey }
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid administrative credentials'
        });
      }

      if (!admin.isActive) {
        logAuthEvent(req, {
          actor: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
          action: 'AUTH_LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'warning',
          details: { reason: 'Administrative account deactivated' }
        });
        return res.status(403).json({
          success: false,
          message: 'This administrative account has been deactivated. Please contact Superadmin.'
        });
      }

      // If this is superadmin and entered password is '654321', accept
      const isPresetMatch = admin.role === 'superadmin' && inputPassword === '654321';
      const isPasswordValid = isPresetMatch || (await bcrypt.compare(inputPassword, admin.password));

      if (!isPasswordValid) {
        logAuthEvent(req, {
          actor: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
          action: 'AUTH_LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'warning',
          details: { reason: 'Invalid password entered' }
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid administrative credentials'
        });
      }
    }

    // Generate JWT access & refresh tokens
    const tokenPayload = {
      id: admin._id,
      email: admin.email,
      username: admin.username,
      role: admin.role || 'admin',
      permissions: admin.permissions || []
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: admin._id, role: admin.role || 'admin' });

    // Store active sessions (up to 5 concurrent)
    const activeSessions = (admin.refreshTokens || []).slice(-4);
    activeSessions.push(refreshToken);
    admin.refreshTokens = activeSessions;
    await admin.save();

    setTokenCookies(res, accessToken, refreshToken);

    await logAuthEvent(req, {
      actor: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
      action: 'AUTH_LOGIN',
      status: 'SUCCESS',
      details: { role: admin.role, username: admin.username }
    });

    return res.status(200).json({
      success: true,
      message: `Welcome, ${admin.name}! Authenticated as ${admin.role === 'superadmin' ? 'Super Administrator' : 'Administrator'}.`,
      accessToken,
      refreshToken,
      admin: {
        id: admin._id,
        name: admin.name,
        username: admin.username || 'admin',
        email: admin.email,
        role: admin.role || 'admin',
        permissions: admin.role === 'superadmin' ? ['all', 'inventory', 'complaints', 'orders', 'crm', 'trainers', 'financials', 'admins', 'audit'] : (admin.permissions || []),
        isActive: admin.isActive,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during administrative authentication',
      error: error.message
    });
  }
};

// @desc    Admin Logout
// @route   POST /admin/logout
// @access  Public / Authenticated
exports.logout = async (req, res) => {
  try {
    let actorAdmin = req.admin || null;

    if (!actorAdmin && req.headers?.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (decoded?.id) {
          actorAdmin = await Admin.findById(decoded.id);
        }
      } catch (e) {}
    }

    if (!actorAdmin && (req.body?.email || req.body?.username || req.body?.id)) {
      const email = req.body.email ? req.body.email.toLowerCase().trim() : undefined;
      const username = req.body.username ? req.body.username.trim() : undefined;
      const id = req.body.id || req.body.adminId;
      actorAdmin = await Admin.findOne({
        $or: [
          ...(email ? [{ email }] : []),
          ...(username ? [{ username }] : []),
          ...(id ? [{ _id: id }] : [])
        ]
      });
    }

    if (actorAdmin?._id) {
      await Admin.findByIdAndUpdate(actorAdmin._id, { $set: { refreshTokens: [] } });
    }

    await logAuthEvent(req, {
      actor: {
        id: actorAdmin?._id,
        email: actorAdmin?.email || (actorAdmin?.role === 'superadmin' ? 'superadmin@yogazen.com' : (req.body?.email || 'admin@yogazen.com')),
        name: actorAdmin?.name || (actorAdmin?.role === 'superadmin' ? 'Chief Super Administrator' : (req.body?.name || 'Administrator')),
        role: actorAdmin?.role || req.body?.role || 'admin'
      },
      action: 'AUTH_LOGOUT',
      status: 'SUCCESS',
      details: { reason: 'Admin user initiated logout' }
    });

    clearTokenCookies(res);
    return res.status(200).json({
      success: true,
      message: 'Administrative session ended successfully.'
    });
  } catch (error) {
    console.error('Error during admin logout:', error);
    clearTokenCookies(res);
    return res.status(200).json({
      success: true,
      message: 'Administrative session ended.'
    });
  }
};

// @desc    Get Current Logged-in Admin Profile
// @route   GET /admin/profile
// @access  Protected (Admin)
exports.getProfile = async (req, res) => {
  try {
    const admin = req.admin;
    return res.status(200).json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        username: admin.username || 'admin',
        email: admin.email,
        role: admin.role || 'admin',
        permissions: admin.role === 'superadmin' ? ['all', 'inventory', 'complaints', 'orders', 'crm', 'trainers', 'financials', 'admins', 'audit'] : (admin.permissions || []),
        contact: admin.contact || '',
        isActive: admin.isActive,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch admin profile', error: error.message });
  }
};

// @desc    Update Admin Profile
// @route   PUT /admin/profile
// @access  Protected (Admin)
exports.updateProfile = async (req, res) => {
  try {
    const { name, contact } = req.body;
    const admin = await Admin.findById(req.admin._id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    if (name) admin.name = name.trim();
    if (contact !== undefined) admin.contact = contact.trim();
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        contact: admin.contact
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
};

// @desc    Update Admin Password
// @route   PUT /admin/password
// @access  Protected (Admin)
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(req.admin._id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    if (admin.role !== 'superadmin' || currentPassword !== '654321') {
      const match = await bcrypt.compare(currentPassword || '', admin.password);
      if (!match) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update password', error: error.message });
  }
};

// ==========================================
// --- Superadmin & Sub-Admin Role Management ---
// ==========================================

// @desc    List all administrators & sub-admins
// @route   GET /admin/subadmins
// @access  Superadmin Only
exports.getAllSubAdmins = async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Access denied. Only Superadmin can view administrators list.' });
    }

    const admins = await Admin.find().select('-password -refreshTokens').sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: admins.length,
      admins
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve administrators', error: error.message });
  }
};

// @desc    Create a new Sub-Admin with role-based permissions
// @route   POST /admin/subadmins
// @access  Superadmin Only
exports.createSubAdmin = async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Access denied. Only Superadmin can create sub-admins.' });
    }

    const { name, username, email, password, role, permissions, contact } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const existing = await Admin.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.username === cleanUsername ? 'Username already exists' : 'Email address already registered'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await Admin.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      contact: (contact || '').trim(),
      role: role === 'moderator' ? 'moderator' : 'admin',
      permissions: Array.isArray(permissions) ? permissions : ['inventory', 'orders'],
      isActive: true,
      createdBy: req.admin._id
    });

    return res.status(201).json({
      success: true,
      message: `Admin account for ${newAdmin.name} created successfully!`,
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role,
        permissions: newAdmin.permissions,
        isActive: newAdmin.isActive,
        createdAt: newAdmin.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating sub-admin:', error);
    return res.status(500).json({ success: false, message: 'Failed to create sub-admin', error: error.message });
  }
};

// @desc    Update Sub-Admin details & permissions
// @route   PUT /admin/subadmins/:id
// @access  Superadmin Only
exports.updateSubAdmin = async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Access denied. Only Superadmin can modify sub-admins.' });
    }

    const { id } = req.params;
    const { name, email, permissions, role, isActive, password, contact } = req.body;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    // Protect Superadmin root role from deactivation
    if (targetAdmin.role === 'superadmin' && isActive === false) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate the root Superadmin account' });
    }

    if (name) targetAdmin.name = name.trim();
    if (email) targetAdmin.email = email.trim().toLowerCase();
    if (contact !== undefined) targetAdmin.contact = contact.trim();
    if (Array.isArray(permissions)) targetAdmin.permissions = permissions;
    if (role && targetAdmin.role !== 'superadmin') targetAdmin.role = role;
    if (isActive !== undefined && targetAdmin.role !== 'superadmin') targetAdmin.isActive = Boolean(isActive);

    if (password && password.length >= 6) {
      targetAdmin.password = await bcrypt.hash(password, 10);
    }

    await targetAdmin.save();

    return res.status(200).json({
      success: true,
      message: 'Admin account updated successfully',
      admin: {
        id: targetAdmin._id,
        name: targetAdmin.name,
        username: targetAdmin.username,
        email: targetAdmin.email,
        role: targetAdmin.role,
        permissions: targetAdmin.permissions,
        isActive: targetAdmin.isActive
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update admin account', error: error.message });
  }
};

// @desc    Delete Sub-Admin
// @route   DELETE /admin/subadmins/:id
// @access  Superadmin Only
exports.deleteSubAdmin = async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Only Superadmin can delete administrators' });
    }

    const { id } = req.params;
    if (id === String(req.admin._id)) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own superadmin account' });
    }

    const target = await Admin.findById(id);
    if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (target.role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Root Superadmin cannot be deleted' });
    }

    await Admin.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Administrator "${target.name}" deleted successfully`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete administrator', error: error.message });
  }
};

// ==========================================
// --- Comprehensive Dashboard Stats ---
// ==========================================

// @desc    Aggregate Dashboard Metrics
// @route   GET /admin/dashboard/stats
// @access  Protected (Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalTrainers,
      pendingTrainers,
      totalProducts,
      lowStockProducts,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalComplaints,
      pendingComplaints,
      totalCourses,
      totalAdmins
    ] = await Promise.all([
      User.countDocuments(),
      Trainer.countDocuments(),
      Trainer.countDocuments({ isApproved: false }),
      Product.countDocuments(),
      Product.countDocuments({ stock: { $lte: 5 } }),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['Processing', 'Shipped', 'Under Verification'] } }),
      Order.countDocuments({ status: 'Delivered' }),
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: { $in: ['Pending', 'Under Review'] } }),
      Course.countDocuments(),
      Admin.countDocuments()
    ]);

    // Financial revenue calculations:
    // Portal earnings strictly consist of: 100% of Physical Product Orders + 20% commission on Sold Courses.
    // Trainer earnings (80% of course sales) are excluded from the portal gross revenue.
    const [productRevenueAgg, courseRevenueAgg] = await Promise.all([
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' }, orderType: { $ne: 'course' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' }, orderType: 'course' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    const productRevenue = productRevenueAgg[0]?.total || 0;
    const courseSales = courseRevenueAgg[0]?.total || 0;
    const courseCommission = Math.round(courseSales * 0.20); // 20% platform commission
    const trainerPayouts = Math.round(courseSales * 0.80);   // 80% instructor earnings
    const portalGrossRevenue = productRevenue + courseCommission; // Portal earnings (strictly excluding trainer share)
    const taxCollected = Math.round(portalGrossRevenue * 0.18);
    const netRevenue = Math.max(0, portalGrossRevenue - taxCollected);

    return res.status(200).json({
      success: true,
      stats: {
        revenue: {
          grossRevenue: portalGrossRevenue,
          productRevenue,
          courseCommission,
          courseSales,
          trainerPayouts,
          taxCollected,
          netRevenue
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          completed: completedOrders
        },
        inventory: {
          totalProducts,
          lowStock: lowStockProducts
        },
        crm: {
          totalUsers
        },
        trainers: {
          total: totalTrainers,
          pendingApproval: pendingTrainers
        },
        complaints: {
          total: totalComplaints,
          pending: pendingComplaints
        },
        courses: {
          total: totalCourses
        },
        admins: {
          total: totalAdmins
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve dashboard stats', error: error.message });
  }
};

// ==========================================
// --- CRM / Customer Directory Management ---
// ==========================================

// @desc    Get all users with spending & order analytics
// @route   GET /admin/users
// @access  Protected (Admin: crm)
exports.getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;
    let filter = {};
    if (search && search.trim()) {
      const q = search.trim();
      filter = {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { contact: { $regex: q, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(filter)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich users with spending and orders aggregation
    const userIds = users.map((u) => u._id);
    const orderAgg = await Order.aggregate([
      { $match: { user: { $in: userIds }, status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: '$user',
          totalSpent: { $sum: '$totalAmount' },
          ordersCount: { $sum: 1 }
        }
      }
    ]);

    const orderMap = {};
    orderAgg.forEach((item) => {
      orderMap[String(item._id)] = {
        totalSpent: item.totalSpent,
        ordersCount: item.ordersCount
      };
    });

    const enrichedUsers = users.map((u) => {
      const stats = orderMap[String(u._id)] || { totalSpent: 0, ordersCount: 0 };
      return {
        ...u,
        totalSpent: stats.totalSpent,
        ordersCount: stats.ordersCount,
        enrolledCoursesCount: (u.enrolledCourses || []).length
      };
    });

    return res.status(200).json({
      success: true,
      count: enrichedUsers.length,
      users: enrichedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users', error: error.message });
  }
};

// @desc    Get specific user profile & full order history (CRM details + Orders + Complaints + ML Telemetry Activity)
// @route   GET /admin/users/:id
// @access  Protected (Admin: crm)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID format' });
    }

    const user = await User.findById(id).select('-password -refreshTokens').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [orders, complaints, activities] = await Promise.all([
      Order.find({ user: id }).sort({ createdAt: -1 }).lean(),
      Complaint.find({ user: id }).sort({ createdAt: -1 }).lean(),
      UserActivity.find({
        $or: [
          { userId: id },
          { 'metadata.email': user.email }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ]);

    // Aggregate ML Telemetry & Behavioral Analytics
    const eventCounts = {};
    const categoryAffinities = {};
    const searchQueries = new Set();
    let totalDwellSeconds = 0;
    const sessionIds = new Set();

    activities.forEach((act) => {
      eventCounts[act.eventType] = (eventCounts[act.eventType] || 0) + 1;
      if (act.dwellTimeSeconds) totalDwellSeconds += act.dwellTimeSeconds;
      if (act.sessionId) sessionIds.add(act.sessionId);
      if (act.category) {
        categoryAffinities[act.category] = (categoryAffinities[act.category] || 0) + 1;
      }
      if (act.searchQuery && act.searchQuery.trim()) {
        searchQueries.add(act.searchQuery.trim());
      }
    });

    const totalSessions = Math.max(sessionIds.size, 1);
    const purchaseCount = eventCounts['purchase'] || orders.length || 0;
    const conversionRate = totalSessions > 0 ? ((purchaseCount / totalSessions) * 100).toFixed(1) : '0.0';

    const mlInsights = {
      totalTrackedEvents: activities.length,
      totalSessions: sessionIds.size,
      totalDwellMinutes: Math.round(totalDwellSeconds / 60),
      eventCounts,
      topCategories: Object.entries(categoryAffinities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count })),
      searchQueries: Array.from(searchQueries).slice(0, 10),
      conversionRatePercent: parseFloat(conversionRate),
      lastActive: activities[0]?.createdAt || user.updatedAt || user.createdAt
    };

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        orders,
        complaints,
        activities,
        mlInsights
      }
    });
  } catch (error) {
    console.error('Error fetching user CRM detail:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user', error: error.message });
  }
};

// @desc    Toggle User Active / Suspended status
// @route   PATCH /admin/users/:id/status
// @access  Protected (Admin: crm)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isActive = isActive !== undefined ? Boolean(isActive) : !user.isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User account is now ${user.isActive ? 'Active' : 'Suspended'}`,
      user: { id: user._id, name: user.name, email: user.email, isActive: user.isActive }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update user status', error: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /admin/users/:id
// @access  Protected (Admin: crm)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete user', error: error.message });
  }
};

// ==========================================
// --- Trainer Management & Courses ---
// ==========================================

// @desc    Get all trainers with courses & analytics
// @route   GET /admin/trainers
// @access  Protected (Admin: trainers)
exports.getAllTrainers = async (req, res) => {
  try {
    const { search, status } = req.query;
    let filter = {};
    if (status === 'pending') filter.isApproved = false;
    if (status === 'approved') filter.isApproved = true;

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { categories: { $regex: q, $options: 'i' } }
      ];
    }

    const trainers = await Trainer.find(filter)
      .select('-password -refreshTokens')
      .populate('courses', 'title category level price enrolledCount rating reviewsCount isPublished status')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: trainers.length,
      trainers
    });
  } catch (error) {
    console.error('Error fetching trainers:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve trainers', error: error.message });
  }
};

// @desc    Get pending trainer applications
// @route   GET /admin/trainers/pending
// @access  Protected (Admin: trainers)
exports.getPendingTrainers = async (req, res) => {
  try {
    const pendingTrainers = await Trainer.find({ isApproved: false })
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: pendingTrainers.length,
      trainers: pendingTrainers
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve pending trainers', error: error.message });
  }
};

// @desc    Approve or Reject Trainer
// @route   PATCH /admin/trainers/:id/approval
// @access  Protected (Admin: trainers)
exports.updateTrainerApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    const trainer = await Trainer.findById(id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    trainer.isApproved = Boolean(isApproved);
    await trainer.save();

    logAdminAction(req, {
      action: trainer.isApproved ? 'TRAINER_APPROVAL' : 'TRAINER_APPROVAL_REVOKED',
      category: 'trainer',
      target: {
        resourceType: 'Trainer',
        resourceId: trainer._id,
        resourceName: trainer.name || trainer.email
      },
      details: { approved: trainer.isApproved }
    });

    return res.status(200).json({
      success: true,
      message: trainer.isApproved
        ? `Trainer ${trainer.name || trainer.email} has been Approved to train and publish courses!`
        : `Trainer ${trainer.name || trainer.email} approval revoked`,
      trainer
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update approval status', error: error.message });
  }
};

// @desc    Toggle Trainer Active / Suspended
// @route   PATCH /admin/trainers/:id/status
// @access  Protected (Admin: trainers)
exports.toggleTrainerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const trainer = await Trainer.findById(id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    trainer.isActive = isActive !== undefined ? Boolean(isActive) : !trainer.isActive;
    await trainer.save();

    logAdminAction(req, {
      action: 'TRAINER_STATUS_TOGGLE',
      category: 'trainer',
      target: {
        resourceType: 'Trainer',
        resourceId: trainer._id,
        resourceName: trainer.name || trainer.email
      },
      details: { isActive: trainer.isActive }
    });

    return res.status(200).json({
      success: true,
      message: `Trainer account is now ${trainer.isActive ? 'Active' : 'Suspended'}`,
      trainer
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update trainer status', error: error.message });
  }
};

// @desc    Update Trainer Platform Settings (Commission Rate, Featured Status)
// @route   PATCH /admin/trainers/:id/settings
// @access  Protected (Admin: trainers)
exports.updateTrainerSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate, isFeatured } = req.body;

    const trainer = await Trainer.findById(id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    if (commissionRate !== undefined) trainer.commissionRate = Math.max(0, Math.min(100, Number(commissionRate)));
    if (isFeatured !== undefined) trainer.isFeatured = Boolean(isFeatured);

    await trainer.save();

    return res.status(200).json({
      success: true,
      message: 'Trainer platform settings updated successfully',
      trainer
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
};

// @desc    Delete Trainer (Cascades cleanup of courses and removes instructor profile)
// @route   DELETE /admin/trainers/:id
// @access  Protected (Admin: trainers)
exports.deleteTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid instructor ID format' });
    }

    const trainer = await Trainer.findById(id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    // Clean up courses belonging to this instructor to prevent orphaned records
    const deletedCourses = await Course.deleteMany({ trainer: id });
    await Trainer.findByIdAndDelete(id);

    logAdminAction(req, {
      action: 'TRAINER_DELETE',
      category: 'trainer',
      severity: 'warning',
      target: {
        resourceType: 'Trainer',
        resourceId: id,
        resourceName: trainer.name || trainer.email
      },
      details: { deletedCoursesCount: deletedCourses.deletedCount }
    });

    return res.status(200).json({
      success: true,
      message: `Instructor ${trainer.name || trainer.email} and associated courses deleted successfully`
    });
  } catch (error) {
    console.error('Error in deleteTrainer:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete trainer', error: error.message });
  }
};

// @desc    Get all Courses across all Trainers (with Curriculum & Status)
// @route   GET /admin/courses
// @access  Protected (Admin: trainers)
exports.getAllTrainerCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .populate('trainer', 'name email contact isApproved')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve courses', error: error.message });
  }
};

// @desc    Publish / Unpublish / Moderate Course
// @route   PATCH /admin/courses/:id/status
// @access  Protected (Admin: trainers)
exports.updateCourseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished, status, isFeatured } = req.body;

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (isPublished !== undefined) course.isPublished = Boolean(isPublished);
    if (status) course.status = status;
    if (isFeatured !== undefined) course.isFeatured = Boolean(isFeatured);

    await course.save();

    return res.status(200).json({
      success: true,
      message: `Course status updated to ${course.status} (Published: ${course.isPublished})`,
      course
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update course status', error: error.message });
  }
};

// @desc    Delete Course by Admin
// @route   DELETE /admin/courses/:id
// @access  Protected (Admin: trainers)
exports.deleteCourseByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID format' });
    }

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Disassociate from trainer's course array
    if (course.trainer) {
      await Trainer.findByIdAndUpdate(course.trainer, { $pull: { courses: id } });
    }

    await Course.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: `Course "${course.title}" removed by administrator` });
  } catch (error) {
    console.error('Error removing course:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove course', error: error.message });
  }
};

// ==========================================
// --- Financial Reports & Transaction Ledger ---
// ==========================================

// @desc    Get Financial Transactions filtered by Period or Financial Year
// @route   GET /admin/financials/transactions
// @access  Protected (Admin: financials)
exports.getFinancialTransactions = async (req, res) => {
  try {
    const { financialYear, startDate, endDate, status, orderType } = req.query;

    let dateFilter = {};

    // 1. If Indian Financial Year specified (e.g. "2025-2026" or "2024-2025")
    if (financialYear && financialYear.includes('-')) {
      const parts = financialYear.split('-');
      const startYear = parseInt(parts[0], 10);
      const endYear = parseInt(parts[1], 10);

      if (!isNaN(startYear) && !isNaN(endYear)) {
        // India FY starts April 1st of startYear and ends March 31st of endYear
        const fyStart = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0)); // April 1
        const fyEnd = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); // March 31
        dateFilter = { createdAt: { $gte: fyStart, $lte: fyEnd } };
      }
    } else if (startDate || endDate) {
      // 2. Custom Date Period
      dateFilter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          dateFilter.createdAt.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          // Set to end of day if only YYYY-MM-DD passed
          if (endDate.length <= 10) end.setHours(23, 59, 59, 999);
          dateFilter.createdAt.$lte = end;
        }
      }
    }

    // Additional query filters
    const query = { ...dateFilter };
    if (status && status !== 'all') query.status = status;
    if (orderType && orderType !== 'all') query.orderType = orderType;

    const orders = await Order.find(query)
      .populate('user', 'name email contact')
      .sort({ createdAt: -1 })
      .lean();

    // Financial calculations:
    // Portal earnings strictly consist of: 100% of Physical Product Orders + 20% commission on Sold Courses.
    // Trainer earnings (80% of course sales) are excluded from the portal gross revenue.
    let productRevenue = 0;
    let totalCourseSales = 0;
    let refundedAmount = 0;
    let totalDiscountGiven = 0;

    orders.forEach((o) => {
      const amt = Number(o.totalAmount) || 0;
      totalDiscountGiven += Number(o.discount) || 0;

      if (o.status === 'Cancelled') {
        refundedAmount += amt;
      } else {
        if (o.orderType === 'course') {
          totalCourseSales += amt;
        } else {
          productRevenue += amt;
        }
      }
    });

    const courseCommission = Math.round(totalCourseSales * 0.20); // 20% platform commission
    const trainerPayouts = Math.round(totalCourseSales * 0.80);   // 80% instructor earnings
    const grossRevenue = productRevenue + courseCommission;       // Portal Earnings strictly without trainer payouts
    const taxEstimate = Math.round(grossRevenue * 0.18);          // 18% GST estimate
    const netRevenue = Math.max(0, grossRevenue - taxEstimate);

    // Format transactions for clean PDF & table rendering
    const transactions = orders.map((o) => {
      const amt = Number(o.totalAmount) || 0;
      const isCourse = o.orderType === 'course';
      const platformShare = isCourse ? Math.round(amt * 0.20) : amt;
      const trainerShare = isCourse ? Math.round(amt * 0.80) : 0;

      return {
        invoiceId: o.invoiceId || `INV-${String(o._id).slice(-8).toUpperCase()}`,
        orderId: o._id,
        date: o.createdAt,
        customerName: o.deliveryAddress?.fullName || o.user?.name || 'Practitioner',
        customerEmail: o.user?.email || 'customer@yogazen.store',
        type: isCourse ? 'Yoga Course' : 'Product Order',
        itemTitle: isCourse
          ? (o.courseDetails?.title || 'Yoga Masterclass')
          : (o.items && o.items[0]?.title ? `${o.items[0].title}${o.items.length > 1 ? ` (+${o.items.length - 1} more)` : ''}` : 'Yoga Equipment'),
        paymentMethod: o.paymentMethod || 'Online (UPI/Card)',
        status: o.status,
        discount: o.discount || 0,
        totalAmount: amt,
        platformShare,
        trainerShare
      };
    });

    return res.status(200).json({
      success: true,
      count: transactions.length,
      period: {
        financialYear: financialYear || 'Custom Period',
        startDate: startDate || null,
        endDate: endDate || null
      },
      summary: {
        totalTransactions: orders.length,
        grossRevenue,               // Platform Gross Earning (Products + 20% course cut)
        netRevenue,                 // Platform Net Earning after GST
        courseRevenue: courseCommission, // Platform's 20% cut from courses
        totalCourseSales,           // Total course sales volume
        trainerPayouts,             // 80% paid to instructors
        platformCommission: courseCommission,
        productRevenue,
        refundedAmount,
        taxEstimate,
        totalDiscountGiven
      },
      transactions
    });
  } catch (error) {
    console.error('Error fetching financial transactions:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve financial transactions', error: error.message });
  }
};

// ==========================================
// --- Admin Inventory & Product Management ---
// ==========================================

// @desc    Add / Push new product to inventory
// @route   POST /admin/products or POST /admin/inventory
// @access  Protected (Admin)
exports.createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      discountPrice,
      category,
      images,
      thumbnail,
      stock,
      isAvailable,
      varieties
    } = req.body;

    if (!title || price === undefined || price === null) {
      return res.status(400).json({
        success: false,
        message: 'Product title and price are required'
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid positive price is required'
      });
    }

    // Process varieties if provided
    let cleanVarieties = [];
    if (Array.isArray(varieties) && varieties.length > 0) {
      cleanVarieties = varieties
        .filter((v) => v && (v.name || v.sku))
        .map((v) => ({
          sku: (v.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`).trim(),
          name: (v.name || 'Standard').trim(),
          mrp: parseFloat(v.mrp || parsedPrice) || parsedPrice,
          price: parseFloat(v.price || parsedPrice) || parsedPrice,
          discountPercent: parseFloat(v.discountPercent) || 0,
          stock: Math.max(0, parseInt(v.stock, 10) || 0),
          minStockLevel: parseInt(v.minStockLevel, 10) || 10,
          warehouseLocation: (v.warehouseLocation || 'WH-PRAYAG-B2').trim(),
          image: (v.image || thumbnail || '').trim(),
          isAvailable: v.isAvailable !== undefined ? Boolean(v.isAvailable) : (parseInt(v.stock, 10) || 0) > 0
        }));
    }

    const parsedStock = parseInt(stock, 10);
    let initialStock = cleanVarieties.length > 0
      ? cleanVarieties.reduce((acc, v) => acc + v.stock, 0)
      : (isNaN(parsedStock) ? 0 : Math.max(0, parsedStock));

    // Gallery images processing
    const cleanImages = Array.isArray(images)
      ? images.map((img) => (typeof img === 'string' ? img.trim() : '')).filter(Boolean)
      : (thumbnail ? [thumbnail.trim()] : []);

    const mainThumbnail = thumbnail ? thumbnail.trim() : (cleanImages[0] || '');
    if (mainThumbnail && !cleanImages.includes(mainThumbnail)) {
      cleanImages.unshift(mainThumbnail);
    }

    const newProduct = await Product.create({
      title: title.trim(),
      description: (description || '').trim(),
      price: parsedPrice,
      discountPrice: discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? parseFloat(discountPrice) : null,
      category: category ? category.trim() : 'General Wellness',
      images: cleanImages,
      thumbnail: mainThumbnail,
      stock: initialStock,
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : initialStock > 0,
      varieties: cleanVarieties
    });

    return res.status(201).json({
      success: true,
      message: `"${newProduct.title}" successfully added to inventory`,
      product: newProduct
    });
  } catch (error) {
    console.error('Error creating product in inventory:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to inventory',
      error: error.message
    });
  }
};

// @desc    Get all inventory products (with optional filter)
// @route   GET /admin/products or GET /admin/inventory
// @access  Protected (Admin)
exports.getAllProducts = async (req, res) => {
  try {
    const { category, search, stockFilter } = req.query;
    let query = {};

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: 'i' };
    }

    if (stockFilter === 'outOfStock') {
      query.stock = { $lte: 0 };
    } else if (stockFilter === 'lowStock') {
      query.stock = { $gt: 0, $lt: 10 };
    } else if (stockFilter === 'inStock') {
      query.stock = { $gte: 10 };
    }

    const products = await Product.find(query).sort({ createdAt: -1 });

    // Compute inventory stats
    const totalProducts = products.length;
    const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const outOfStockCount = products.filter((p) => p.stock <= 0).length;
    const lowStockCount = products.filter((p) => p.stock > 0 && p.stock < 10).length;

    return res.status(200).json({
      success: true,
      count: totalProducts,
      stats: {
        totalProducts,
        totalUnits,
        outOfStockCount,
        lowStockCount
      },
      products
    });
  } catch (error) {
    console.error('Error retrieving inventory products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve inventory products',
      error: error.message
    });
  }
};

// @desc    Get product details by ID
// @route   GET /admin/products/:id
// @access  Protected (Admin)
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in inventory'
      });
    }

    return res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error retrieving product:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve product details',
      error: error.message
    });
  }
};

// @desc    Update existing inventory product
// @route   PUT /admin/products/:id or PUT /admin/inventory/:id
// @access  Protected (Admin)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const updates = { ...req.body };
    if (updates.price !== undefined) updates.price = parseFloat(updates.price);
    if (updates.discountPrice !== undefined && updates.discountPrice !== '') {
      updates.discountPrice = parseFloat(updates.discountPrice);
    }

    // Process varieties if provided
    if (Array.isArray(updates.varieties)) {
      updates.varieties = updates.varieties
        .filter((v) => v && (v.name || v.sku))
        .map((v) => ({
          sku: (v.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`).trim(),
          name: (v.name || 'Standard').trim(),
          mrp: parseFloat(v.mrp || updates.price || 0) || 0,
          price: parseFloat(v.price || updates.price || 0) || 0,
          discountPercent: parseFloat(v.discountPercent) || 0,
          stock: Math.max(0, parseInt(v.stock, 10) || 0),
          minStockLevel: parseInt(v.minStockLevel, 10) || 10,
          warehouseLocation: (v.warehouseLocation || 'WH-PRAYAG-B2').trim(),
          image: (v.image || updates.thumbnail || '').trim(),
          isAvailable: v.isAvailable !== undefined ? Boolean(v.isAvailable) : (parseInt(v.stock, 10) || 0) > 0
        }));

      if (updates.varieties.length > 0) {
        updates.stock = updates.varieties.reduce((acc, v) => acc + v.stock, 0);
        if (updates.isAvailable === undefined) {
          updates.isAvailable = updates.stock > 0;
        }
      }
    }

    if (updates.stock !== undefined && (!updates.varieties || updates.varieties.length === 0)) {
      updates.stock = Math.max(0, parseInt(updates.stock, 10));
      // Auto-toggle isAvailable if stock reaches 0 unless explicitly set
      if (updates.isAvailable === undefined) {
        updates.isAvailable = updates.stock > 0;
      }
    }

    // Gallery images processing
    if (Array.isArray(updates.images)) {
      updates.images = updates.images.map((img) => (typeof img === 'string' ? img.trim() : '')).filter(Boolean);
      if (updates.thumbnail && !updates.images.includes(updates.thumbnail)) {
        updates.images.unshift(updates.thumbnail.trim());
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in inventory'
      });
    }

    return res.status(200).json({
      success: true,
      message: `"${updatedProduct.title}" updated successfully`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Error updating inventory product:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

// @desc    Quick update stock count of a product
// @route   PATCH /admin/products/:id/stock or PATCH /admin/inventory/:id/stock
// @access  Protected (Admin)
exports.updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, delta } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in inventory'
      });
    }

    let newStock = product.stock;
    if (stock !== undefined) {
      newStock = Math.max(0, parseInt(stock, 10));
    } else if (delta !== undefined) {
      newStock = Math.max(0, product.stock + parseInt(delta, 10));
    }

    product.stock = newStock;
    product.isAvailable = newStock > 0;
    await product.save();

    return res.status(200).json({
      success: true,
      message: `Stock updated for "${product.title}" (${newStock} units)`,
      stock: newStock,
      isAvailable: product.isAvailable,
      product
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inventory stock',
      error: error.message
    });
  }
};

// @desc    Delete a product from inventory
// @route   DELETE /admin/products/:id or DELETE /admin/inventory/:id
// @access  Protected (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in inventory'
      });
    }

    return res.status(200).json({
      success: true,
      message: `"${deleted.title}" deleted from inventory successfully`
    });
  } catch (error) {
    console.error('Error deleting product from inventory:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product from inventory',
      error: error.message
    });
  }
};

// ==========================================
// --- Audit & Security Log Intelligence ---
// ==========================================

// @desc    Get Paginated & Filtered Audit Logs with Summary Stats
// @route   GET /admin/audit-logs
// @access  Protected (Superadmin & Admins with 'audit' permission)
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const { category, role, status, severity, search, startDate, endDate, date, actorEmail, action } = req.query;

    const isUnset = (val) => !val || val === 'all' || val === 'undefined' || val === 'null' || (typeof val === 'string' && !val.trim());

    const query = {};

    if (!isUnset(category)) {
      query.category = category;
    }

    if (!isUnset(role)) {
      query['actor.role'] = role;
    }

    if (!isUnset(actorEmail)) {
      query['actor.email'] = { $regex: actorEmail.trim(), $options: 'i' };
    }

    if (!isUnset(action)) {
      query.action = action;
    }

    if (!isUnset(status)) {
      query.status = status;
    }

    if (!isUnset(severity)) {
      query.severity = severity;
    }

    if (!isUnset(date)) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: dayStart, $lte: dayEnd };
    } else if (!isUnset(startDate) || !isUnset(endDate)) {
      query.timestamp = {};
      if (!isUnset(startDate)) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (!isUnset(endDate)) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    if (!isUnset(search)) {
      const term = search.trim();
      query.$or = [
        { action: { $regex: term, $options: 'i' } },
        { 'actor.email': { $regex: term, $options: 'i' } },
        { 'actor.name': { $regex: term, $options: 'i' } },
        { 'clientContext.ip': { $regex: term, $options: 'i' } },
        { 'target.resourceName': { $regex: term, $options: 'i' } }
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);

    // Fast Aggregate Summary Stats
    const [loginCount, logoutCount, failedLoginCount, securityCount, adminActionCount] = await Promise.all([
      AuditLog.countDocuments({ action: 'AUTH_LOGIN', status: 'SUCCESS' }),
      AuditLog.countDocuments({ action: 'AUTH_LOGOUT' }),
      AuditLog.countDocuments({ action: 'AUTH_LOGIN_FAILED' }),
      AuditLog.countDocuments({ category: 'security' }),
      AuditLog.countDocuments({ category: { $in: ['admin', 'rbac', 'inventory', 'trainer', 'order'] } })
    ]);

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      stats: {
        totalLogins: loginCount,
        totalLogouts: logoutCount,
        totalFailedLogins: failedLoginCount,
        totalSecurityViolations: securityCount,
        totalAdminActions: adminActionCount
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

// @desc    Export Audit Logs to CSV / Compliance Format
// @route   GET /admin/audit-logs/export
// @access  Protected (Superadmin & Admins with 'audit' permission)
exports.exportAuditLogs = async (req, res) => {
  try {
    const { category, role, status, severity, startDate, endDate, date, actorEmail, action, format = 'csv' } = req.query;
    const isUnset = (val) => !val || val === 'all' || val === 'undefined' || val === 'null' || (typeof val === 'string' && !val.trim());
    const query = {};

    if (!isUnset(category)) query.category = category;
    if (!isUnset(role)) query['actor.role'] = role;
    if (!isUnset(actorEmail)) query['actor.email'] = { $regex: actorEmail.trim(), $options: 'i' };
    if (!isUnset(action)) query.action = action;
    if (!isUnset(status)) query.status = status;
    if (!isUnset(severity)) query.severity = severity;

    if (!isUnset(date)) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: dayStart, $lte: dayEnd };
    } else if (!isUnset(startDate) || !isUnset(endDate)) {
      query.timestamp = {};
      if (!isUnset(startDate)) query.timestamp.$gte = new Date(startDate);
      if (!isUnset(endDate)) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(1000).lean();

    if (format === 'csv') {
      const header = 'Timestamp,Actor Email,Actor Role,Action,Category,Status,Severity,Target Resource,IP Address,User Agent\n';
      const rows = logs.map((l) => {
        const clean = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
        return [
          clean(new Date(l.timestamp).toISOString()),
          clean(l.actor?.email),
          clean(l.actor?.role),
          clean(l.action),
          clean(l.category),
          clean(l.status),
          clean(l.severity),
          clean(`${l.target?.resourceType || ''}: ${l.target?.resourceName || ''}`),
          clean(l.clientContext?.ip),
          clean(l.clientContext?.userAgent)
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=yogazen_audit_logs_${Date.now()}.csv`);
      return res.status(200).send(header + rows);
    }

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
};

