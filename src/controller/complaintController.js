const Complaint = require('../models/complaintSchema');
const Order = require('../models/orderSchema');

// Utility to generate unique ticket ID
const generateTicketId = () => `CMP-2026-${Math.floor(10000 + Math.random() * 90000)}`;

// 1. User: Submit a new complaint against an order
exports.createComplaint = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, category, subject, description, priority } = req.body;

    if (!orderId || !category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, category, subject, and description are required.'
      });
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Associated order was not found for this account.'
      });
    }

    // Check if an open complaint already exists for this order
    const existingOpenComplaint = await Complaint.findOne({
      order: order._id,
      user: userId,
      status: { $in: ['Pending', 'In Review'] }
    });

    if (existingOpenComplaint) {
      return res.status(400).json({
        success: false,
        message: `An active complaint (${existingOpenComplaint.ticketId}) is already under review for Order ${order.orderNumber}.`
      });
    }

    const ticketId = generateTicketId();

    const newComplaint = new Complaint({
      ticketId,
      user: userId,
      order: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      category,
      subject,
      description,
      priority: priority || 'Medium',
      status: 'Pending'
    });

    await newComplaint.save();

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully. Our team will review your order.',
      complaint: newComplaint
    });
  } catch (error) {
    console.error('Error creating complaint:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit complaint.',
      error: error.message
    });
  }
};

// 2. User: Get all complaints raised by current user
exports.getMyComplaints = async (req, res) => {
  try {
    const userId = req.user._id;

    const complaints = await Complaint.find({ user: userId })
      .populate('order', 'orderNumber orderType items courseDetails totalAmount status createdAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints
    });
  } catch (error) {
    console.error('Error retrieving user complaints:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your complaints.',
      error: error.message
    });
  }
};

// 3. Admin: Get all complaints with filtering & search
exports.adminGetAllComplaints = async (req, res) => {
  try {
    const { status, orderType, search, priority } = req.query;

    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (orderType && orderType !== 'All') {
      filter.orderType = orderType;
    }

    if (priority && priority !== 'All') {
      filter.priority = priority;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { ticketId: searchRegex },
        { orderNumber: searchRegex },
        { subject: searchRegex },
        { description: searchRegex }
      ];
    }

    const complaints = await Complaint.find(filter)
      .populate('user', 'name email contact')
      .populate('order')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints
    });
  } catch (error) {
    console.error('Error fetching admin complaints:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints list.',
      error: error.message
    });
  }
};

// 4. Admin: Get summary statistics for complaints
exports.adminGetComplaintStats = async (req, res) => {
  try {
    const total = await Complaint.countDocuments();
    const pending = await Complaint.countDocuments({ status: 'Pending' });
    const inReview = await Complaint.countDocuments({ status: 'In Review' });
    const resolved = await Complaint.countDocuments({ status: 'Resolved' });
    const rejected = await Complaint.countDocuments({ status: 'Rejected' });

    const productComplaints = await Complaint.countDocuments({ orderType: 'product' });
    const courseComplaints = await Complaint.countDocuments({ orderType: 'course' });

    return res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        inReview,
        resolved,
        rejected,
        productComplaints,
        courseComplaints
      }
    });
  } catch (error) {
    console.error('Error fetching complaint stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint statistics.',
      error: error.message
    });
  }
};

// 5. Admin: Update complaint status, priority, and post admin resolution response
exports.adminUpdateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, adminResponse, adminNotes } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint record not found.'
      });
    }

    if (status) complaint.status = status;
    if (priority) complaint.priority = priority;
    if (adminResponse !== undefined) complaint.adminResponse = adminResponse;
    if (adminNotes !== undefined) complaint.adminNotes = adminNotes;

    if (status === 'Resolved' || status === 'Rejected') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.admin?._id;
    }

    await complaint.save();

    return res.status(200).json({
      success: true,
      message: `Complaint ticket ${complaint.ticketId} updated successfully.`,
      complaint
    });
  } catch (error) {
    console.error('Error updating complaint:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update complaint.',
      error: error.message
    });
  }
};

