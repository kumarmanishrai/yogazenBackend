const Order = require('../models/orderSchema');
const Product = require('../models/productSchema');

// Utility to generate unique human-readable ID
const generateOrderId = () => `YZ-ORD-2026-${Math.floor(10000 + Math.random() * 90000)}`;
const generateInvoiceId = () => `YZ-INV-2026-${Math.floor(10000 + Math.random() * 90000)}`;

// Get all previous orders for the logged-in user
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    let orders = await Order.find({ user: userId }).sort({ createdAt: -1 });

    // Seed realistic initial orders if new user has no orders yet
    if (!orders || orders.length === 0) {
      // Find a couple of products from DB to link real varieties if available
      const sampleProducts = await Product.find({}).limit(2);

      const defaultProduct = sampleProducts[0] || null;
      const defaultVariety = defaultProduct?.varieties?.[0] || null;

      const sampleProductOrder = new Order({
        user: userId,
        orderNumber: generateOrderId(),
        invoiceId: generateInvoiceId(),
        orderType: 'product',
        items: [
          {
            product: defaultProduct?._id || undefined,
            title: defaultProduct?.title || 'Organic Cotton Yoga Mat - Manduka Pro',
            varietySku: defaultVariety?.sku || 'YOGA-MAT-SAGE-01',
            varietyName: defaultVariety?.name || 'Sage Green / Standard 6mm',
            varietyImage: defaultVariety?.images?.[0] || defaultProduct?.images?.[0] || 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600',
            unitPrice: defaultVariety?.price || defaultProduct?.discountedPrice || 1899,
            quantity: 1
          }
        ],
        shippingAddress: {
          street: req.user.addresses?.[0]?.street || '42 Lotus Bloom Avenue, Flat 3B',
          landmark: req.user.addresses?.[0]?.landmark || 'Near Isha Center',
          city: req.user.addresses?.[0]?.city || 'Bengaluru',
          state: req.user.addresses?.[0]?.state || 'Karnataka',
          country: 'India',
          pincode: req.user.addresses?.[0]?.pincode || '560038',
          contact: req.user.contact || '+91 98765 43210'
        },
        totalAmount: defaultVariety?.price || defaultProduct?.discountedPrice || 1899,
        status: 'Delivered',
        paymentStatus: 'Paid',
        paymentMethod: 'UPI / Razorpay',
        trackingNumber: 'BLUEDART-8829104',
        deliveredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      });

      const sampleCourseOrder = new Order({
        user: userId,
        orderNumber: generateOrderId(),
        invoiceId: generateInvoiceId(),
        orderType: 'course',
        courseDetails: {
          title: 'Hatha Yoga for Flexibility & Inner Balance',
          trainer: 'Acharya Devansh',
          category: 'Yoga Asana',
          validity: 'Lifetime Access'
        },
        totalAmount: 1499,
        status: 'Active',
        paymentStatus: 'Paid',
        paymentMethod: 'Card / NetBanking',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      await sampleProductOrder.save();
      await sampleCourseOrder.save();

      orders = [sampleProductOrder, sampleCourseOrder];
    }

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

// Create a new order (e.g. on checkout or course enrollment)
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderType, items, courseDetails, shippingAddress, totalAmount, paymentMethod } = req.body;

    if (!orderType || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Order type and total amount are required.'
      });
    }

    const orderNumber = generateOrderId();
    const invoiceId = generateInvoiceId();

    const newOrder = new Order({
      user: userId,
      orderNumber,
      invoiceId,
      orderType,
      items: orderType === 'product' ? items || [] : [],
      courseDetails: orderType === 'course' ? courseDetails : undefined,
      shippingAddress: orderType === 'product' ? shippingAddress || {} : undefined,
      totalAmount,
      status: orderType === 'product' ? 'Processing' : 'Active',
      paymentStatus: 'Paid',
      paymentMethod: paymentMethod || 'Online / Card / UPI',
      trackingNumber: orderType === 'product' ? `TRK-${Math.floor(1000000 + Math.random() * 9000000)}` : ''
    });

    await newOrder.save();

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

// Get a single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, user: req.user._id });

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

