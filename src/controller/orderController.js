const Order = require('../models/orderSchema');
const Coupon = Order.Coupon;
const Product = require('../models/productSchema');
const Course = require('../models/courseSchema');
const User = require('../models/userSchema');
const Trainer = require('../models/trainerSchema');

// Utility to generate unique human-readable ID
const generateOrderId = () => `YZ-ORD-2026-${Math.floor(10000 + Math.random() * 90000)}`;
const generateInvoiceId = () => `YZ-INV-2026-${Math.floor(10000 + Math.random() * 90000)}`;

// Standard YogaZen Promotional Coupons Fallback
const AVAILABLE_COUPONS = {
  YOGA10: {
    code: 'YOGA10',
    type: 'percent',
    discount: 10,
    minOrder: 500,
    description: '10% OFF on all wellness items (Min order ₹500)'
  },
  ZEN20: {
    code: 'ZEN20',
    type: 'percent',
    discount: 20,
    minOrder: 1999,
    maxDiscount: 1000,
    description: '20% OFF on orders above ₹1,999 (Max discount ₹1,000)'
  },
  FREESHIP: {
    code: 'FREESHIP',
    type: 'shipping',
    discount: 149,
    minOrder: 0,
    description: 'FREE Delivery on your current cart'
  },
  MINDFUL500: {
    code: 'MINDFUL500',
    type: 'flat',
    discount: 500,
    minOrder: 2499,
    description: 'Flat ₹500 OFF on orders above ₹2,499'
  }
};

// @desc    Validate a promotional coupon code
// @route   POST /orders/validate-coupon
// @access  Public / Authenticated
exports.validateCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;

    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid coupon code.'
      });
    }

    const cleanCode = couponCode.trim().toUpperCase();
    const orderSubtotal = parseFloat(subtotal) || 0;

    // Check dynamic MongoDB Coupon first
    const dbCoupon = await Coupon.findOne({ code: cleanCode, isActive: true });
    if (dbCoupon) {
      if (dbCoupon.expiresAt && new Date() > new Date(dbCoupon.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: `Coupon "${cleanCode}" has expired.`
        });
      }

      if (dbCoupon.minOrderValue && orderSubtotal < dbCoupon.minOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Coupon "${cleanCode}" requires a minimum cart subtotal of ₹${dbCoupon.minOrderValue.toLocaleString()}. Current subtotal is ₹${orderSubtotal.toLocaleString()}.`
        });
      }

      let calculatedDiscount = 0;
      if (dbCoupon.discountType === 'percent') {
        calculatedDiscount = Math.round((orderSubtotal * dbCoupon.discountValue) / 100);
        if (dbCoupon.maxDiscount && calculatedDiscount > dbCoupon.maxDiscount) {
          calculatedDiscount = dbCoupon.maxDiscount;
        }
      } else if (dbCoupon.discountType === 'flat') {
        calculatedDiscount = Math.min(orderSubtotal, dbCoupon.discountValue);
      } else if (dbCoupon.discountType === 'shipping') {
        calculatedDiscount = 149;
      }

      return res.status(200).json({
        success: true,
        message: `Promo code "${cleanCode}" applied successfully!`,
        coupon: {
          code: dbCoupon.code,
          type: dbCoupon.discountType,
          discountAmount: calculatedDiscount,
          description: dbCoupon.description || `${cleanCode} Applied`
        }
      });
    }

    // Fallback to predefined system coupons
    const coupon = AVAILABLE_COUPONS[cleanCode];

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: `Coupon "${cleanCode}" is invalid or has expired.`
      });
    }

    if (coupon.minOrder && orderSubtotal < coupon.minOrder) {
      return res.status(400).json({
        success: false,
        message: `Coupon "${cleanCode}" requires a minimum cart subtotal of ₹${coupon.minOrder}. Current subtotal is ₹${orderSubtotal}.`
      });
    }

    let calculatedDiscount = 0;
    if (coupon.type === 'percent') {
      calculatedDiscount = Math.round((orderSubtotal * coupon.discount) / 100);
      if (coupon.maxDiscount && calculatedDiscount > coupon.maxDiscount) {
        calculatedDiscount = coupon.maxDiscount;
      }
    } else if (coupon.type === 'flat') {
      calculatedDiscount = coupon.discount;
    } else if (coupon.type === 'shipping') {
      calculatedDiscount = 149; // standard shipping charge waiver
    }

    return res.status(200).json({
      success: true,
      message: `Coupon "${cleanCode}" applied successfully!`,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discountAmount: calculatedDiscount,
        description: coupon.description
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate coupon code.',
      error: error.message
    });
  }
};

// @desc    Get all previous orders for the logged-in user
// @route   GET /orders/my-orders
// @access  Protected
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;
    const orders = await Order.find({
      $or: [
        { user: userId },
        { user: userId.toString() },
        ...(userEmail ? [{ 'shippingAddress.email': userEmail }] : [])
      ]
    })
      .populate({
        path: 'courseDetails.course',
        populate: { path: 'trainer', select: 'name bio categories experienceYears' }
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order history.',
      error: error.message
    });
  }
};

// @desc    Create a new order (Checkout completion or course enrollment)
// @route   POST /orders
// @access  Protected
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      orderType,
      items,
      courseDetails,
      shippingAddress,
      subtotal,
      couponCode,
      discountAmount,
      shippingFee,
      totalAmount,
      paymentMethod
    } = req.body;

    if (!orderType || totalAmount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Order type and total amount are required.'
      });
    }

    const orderNumber = generateOrderId();
    const invoiceId = generateInvoiceId();

    // Generate courier and tracking details for product orders
    const courierNames = ['BlueDart Express', 'Delhivery', 'DTDC Express', 'Ekart Logistics'];
    const assignedCourier = courierNames[Math.floor(Math.random() * courierNames.length)];
    const generatedTracking = orderType === 'product' ? `TRK-${Math.floor(1000000 + Math.random() * 9000000)}` : '';

    const newOrder = new Order({
      user: userId,
      orderNumber,
      invoiceId,
      orderType,
      items: orderType === 'product' ? items || [] : [],
      courseDetails: orderType === 'course' ? courseDetails : undefined,
      courseProgress: orderType === 'course' ? { completedClasses: [], progressPercentage: 0 } : undefined,
      shippingAddress: orderType === 'product' ? shippingAddress || {} : undefined,
      subtotal: parseFloat(subtotal) || parseFloat(totalAmount),
      couponCode: (couponCode || '').trim().toUpperCase(),
      discountAmount: parseFloat(discountAmount) || 0,
      shippingFee: parseFloat(shippingFee) || 0,
      totalAmount: parseFloat(totalAmount),
      status: orderType === 'product' ? 'Processing' : 'Active',
      paymentStatus: 'Paid',
      paymentMethod: paymentMethod || 'Cash on Delivery (Verified)',
      courierName: orderType === 'product' ? assignedCourier : '',
      trackingNumber: generatedTracking
    });

    await newOrder.save();

    // Decrement inventory stock for physical products
    if (orderType === 'product' && Array.isArray(items)) {
      for (const item of items) {
        if (item.product) {
          const prod = await Product.findById(item.product);
          if (prod) {
            // Decrement variety stock if variety specified
            if (item.varietySku && prod.varieties && prod.varieties.length > 0) {
              const varIdx = prod.varieties.findIndex(v => v.sku === item.varietySku);
              if (varIdx !== -1) {
                prod.varieties[varIdx].stock = Math.max(0, prod.varieties[varIdx].stock - (item.quantity || 1));
              }
            }
            // Decrement total product stock
            prod.stock = Math.max(0, (prod.stock || 0) - (item.quantity || 1));
            await prod.save();
          }
        }
      }
    }

    // If course order, register enrollment for user and trainer
    if (orderType === 'course' && courseDetails?.course) {
      await User.updateOne(
        { _id: userId },
        {
          $push: {
            enrolledCourses: {
              course: courseDetails.course,
              invoiceId,
              amountPaid: parseFloat(totalAmount) || 0,
              enrolledAt: new Date()
            }
          }
        }
      );
      await Course.updateOne(
        { _id: courseDetails.course },
        { $inc: { enrolledCount: 1 } }
      );
      const courseDoc = await Course.findById(courseDetails.course);
      if (courseDoc?.trainer) {
        // Trainer earns 80% net earnings (20% platform commission retained)
        const trainerShare = Math.round((parseFloat(totalAmount) || 0) * 0.80);
        await Trainer.updateOne(
          { _id: courseDoc.trainer },
          { $inc: { totalEarnings: trainerShare } }
        );
      }
    }

    // Increment coupon usage count if coupon was applied
    if (couponCode && couponCode.trim()) {
      await Coupon.updateOne({ code: couponCode.trim().toUpperCase() }, { $inc: { usageCount: 1 } });
    }

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      order: newOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order.',
      error: error.message
    });
  }
};

// @desc    Get a single order by ID
// @route   GET /orders/:id
// @access  Protected
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, user: req.user._id })
      .populate({
        path: 'courseDetails.course',
        populate: { path: 'trainer', select: 'name bio categories experienceYears' }
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    return res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details.',
      error: error.message
    });
  }
};

// @desc    Cancel an order (if in Processing state)
// @route   PUT /orders/:id/cancel
// @access  Protected
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    if (order.status !== 'Processing') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is already ${order.status.toLowerCase()}. You may request a return once delivered.`
      });
    }

    order.status = 'Cancelled';
    order.cancellationReason = (reason || 'Cancelled by customer').trim();
    order.cancelledAt = new Date();
    order.paymentStatus = 'Refunded';

    await order.save();

    // Restore stock if product order
    if (order.orderType === 'product' && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item.product) {
          const prod = await Product.findById(item.product);
          if (prod) {
            if (item.varietySku && prod.varieties && prod.varieties.length > 0) {
              const varIdx = prod.varieties.findIndex(v => v.sku === item.varietySku);
              if (varIdx !== -1) {
                prod.varieties[varIdx].stock += item.quantity || 1;
              }
            }
            prod.stock = (prod.stock || 0) + (item.quantity || 1);
            await prod.save();
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order has been successfully cancelled and refunded.',
      order
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order.',
      error: error.message
    });
  }
};

// @desc    Request return / refund on delivered product order
// @route   PUT /orders/:id/return
// @access  Protected
exports.requestReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Returns can only be requested for delivered orders.'
      });
    }

    order.returnStatus = 'Requested';
    order.returnReason = (reason || 'Customer requested return/exchange within 7-day window.').trim();
    order.returnedAt = new Date();

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Return request submitted. YogaZen care team will arrange complimentary courier pickup within 48 hours.',
      order
    });
  } catch (error) {
    console.error('Error requesting return:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to request return.',
      error: error.message
    });
  }
};

// @desc    Update course student learning progress (mark lessons complete)
// @route   PUT /orders/:id/course-progress
// @access  Protected
exports.updateCourseProgress = async (req, res) => {
  try {
    const { id } = req.params;
    let { classId, totalClasses = 5, completedClasses, progressPercentage } = req.body;

    const order = await Order.findOne({ _id: id, user: req.user._id, orderType: 'course' });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Enrolled course order not found.'
      });
    }

    order.courseProgress = order.courseProgress || { completedClasses: [], progressPercentage: 0 };

    if (Array.isArray(completedClasses)) {
      // Direct array of completed classes passed
      order.courseProgress.completedClasses = completedClasses.map((c) => String(c));
    } else if (classId && typeof classId === 'object' && Array.isArray(classId.completedClasses)) {
      // In case classId was passed as an object containing completedClasses
      order.courseProgress.completedClasses = classId.completedClasses.map((c) => String(c));
      if (typeof classId.progressPercentage === 'number') {
        progressPercentage = classId.progressPercentage;
      }
    } else if (classId && typeof classId !== 'object') {
      // Single classId toggle
      const targetId = String(classId);
      const completedSet = new Set((order.courseProgress.completedClasses || []).map((c) => String(c)));
      if (completedSet.has(targetId)) {
        completedSet.delete(targetId);
      } else {
        completedSet.add(targetId);
      }
      order.courseProgress.completedClasses = Array.from(completedSet);
    }

    const totalCount = Math.max(1, parseInt(totalClasses, 10) || 5);
    if (typeof progressPercentage === 'number') {
      order.courseProgress.progressPercentage = Math.min(100, Math.max(0, Math.round(progressPercentage)));
    } else {
      order.courseProgress.progressPercentage = Math.min(
        100,
        Math.round((order.courseProgress.completedClasses.length / totalCount) * 100)
      );
    }

    if (order.courseProgress.progressPercentage === 100) {
      order.status = 'Completed';
    }

    await order.save();

    return res.status(200).json({
      success: true,
      courseProgress: order.courseProgress,
      orderStatus: order.status
    });
  } catch (error) {
    console.error('Error updating course progress:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update course progress.',
      error: error.message
    });
  }
};

// @desc    Admin: Get all orders across the platform with filtering & analytics
// @route   GET /orders/admin/all
// @access  Protected (Admin)
exports.adminGetAllOrders = async (req, res) => {
  try {
    const { status, orderType, search, page = 1, limit = 50 } = req.query;

    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (orderType && orderType !== 'All') {
      query.orderType = orderType;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { orderNumber: { $regex: s, $options: 'i' } },
        { invoiceId: { $regex: s, $options: 'i' } },
        { trackingNumber: { $regex: s, $options: 'i' } },
        { 'shippingAddress.city': { $regex: s, $options: 'i' } },
        { 'shippingAddress.contact': { $regex: s, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [totalOrders, orders, allForStats] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .populate('user', 'name email contact')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Order.find({}, 'totalAmount status paymentStatus orderType')
    ]);

    // Compute platform order statistics
    const stats = {
      totalOrders: allForStats.length,
      totalRevenue: allForStats.reduce((acc, o) => acc + (o.paymentStatus === 'Paid' ? o.totalAmount : 0), 0),
      pendingFulfillment: allForStats.filter(o => o.status === 'Processing').length,
      shippedCount: allForStats.filter(o => o.status === 'Shipped').length,
      deliveredCount: allForStats.filter(o => o.status === 'Delivered').length,
      cancelledCount: allForStats.filter(o => o.status === 'Cancelled').length
    };

    return res.status(200).json({
      success: true,
      stats,
      count: orders.length,
      total: totalOrders,
      orders
    });
  } catch (error) {
    console.error('Error in adminGetAllOrders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin orders list.',
      error: error.message
    });
  }
};

// @desc    Admin: Update order status & courier dispatch details
// @route   PUT /orders/admin/:id/status
// @access  Protected (Admin)
exports.adminUpdateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, courierName, trackingNumber, paymentStatus } = req.body;

    const order = await Order.findById(id).populate('user', 'name email contact');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    if (status) {
      order.status = status;
      if (status === 'Delivered' && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
    }

    if (courierName !== undefined) order.courierName = courierName.trim();
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber.trim();
    if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order #${order.orderNumber} status updated to "${order.status}".`,
      order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
      error: error.message
    });
  }
};

// @desc    Admin: Get all promo codes with stats & seeds if empty
// @route   GET /orders/admin/coupons
// @access  Protected (Admin only)
exports.adminGetCoupons = async (req, res) => {
  try {
    let coupons = await Coupon.find().sort({ createdAt: -1 });

    // Seed default coupons if database is empty so admin can manage them immediately
    if (coupons.length === 0) {
      const defaultList = [
        {
          code: 'YOGA10',
          discountType: 'percent',
          discountValue: 10,
          minOrderValue: 500,
          description: '10% OFF on all wellness items (Min order ₹500)',
          isActive: true
        },
        {
          code: 'ZEN20',
          discountType: 'percent',
          discountValue: 20,
          minOrderValue: 1999,
          maxDiscount: 1000,
          description: '20% OFF on orders above ₹1,999 (Max discount ₹1,000)',
          isActive: true
        },
        {
          code: 'FREESHIP',
          discountType: 'shipping',
          discountValue: 149,
          minOrderValue: 0,
          description: 'FREE Delivery on your current cart',
          isActive: true
        },
        {
          code: 'MINDFUL500',
          discountType: 'flat',
          discountValue: 500,
          minOrderValue: 2499,
          description: 'Flat ₹500 OFF on orders above ₹2,499',
          isActive: true
        }
      ];
      coupons = await Coupon.insertMany(defaultList);
    }

    return res.status(200).json({
      success: true,
      count: coupons.length,
      coupons
    });
  } catch (error) {
    console.error('Error fetching admin coupons:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
};

// @desc    Admin: Create new promo code
// @route   POST /orders/admin/coupons
// @access  Protected (Admin only)
exports.adminCreateCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, minOrderValue, maxDiscount, description, expiresAt } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({ success: false, message: `Coupon "${cleanCode}" already exists` });
    }

    const newCoupon = await Coupon.create({
      code: cleanCode,
      discountType: discountType || 'percent',
      discountValue: parseFloat(discountValue) || 0,
      minOrderValue: parseFloat(minOrderValue) || 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      description: description || '',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: `Promo code "${cleanCode}" created successfully`,
      coupon: newCoupon
    });
  } catch (error) {
    console.error('Error creating admin coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create promo code',
      error: error.message
    });
  }
};

// @desc    Admin: Toggle coupon active/inactive status
// @route   PUT /orders/admin/coupons/:id/toggle
// @access  Protected (Admin only)
exports.adminToggleCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" is now ${coupon.isActive ? 'Active' : 'Inactive'}`,
      coupon
    });
  } catch (error) {
    console.error('Error toggling coupon status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update coupon status',
      error: error.message
    });
  }
};

// @desc    Admin: Delete promo code
// @route   DELETE /orders/admin/coupons/:id
// @access  Protected (Admin only)
exports.adminDeleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error.message
    });
  }
};

