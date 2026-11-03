const Course = require('../models/courseSchema');
const Trainer = require('../models/trainerSchema');
const User = require('../models/userSchema');
const Order = require('../models/orderSchema');
const { verifyAccessToken } = require('../helper/generateToken');

// Default initial courses to seed if database has none
const DEFAULT_COURSES = [
  {
    title: 'Hatha Yoga & Breathwork for Beginners',
    description: 'Master the fundamental asanas, align your body postures, and unlock deep mental tranquility through sacred Vedic breathwork (Prāṇāyāma). Perfect for beginners seeking physical vitality and inner peace.',
    category: 'Hatha Yoga',
    level: 'Beginner',
    price: 1499,
    thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=80',
    duration: '4 Weeks • 12 Sessions',
    enrolledCount: 142,
    rating: 4.9,
    reviewsCount: 28,
    reviews: [
      {
        userName: 'Priya Sharma',
        rating: 5,
        comment: 'This course transformed my morning routine completely. The pacing of the asanas and breathwork instructions are crystal clear.',
        createdAt: new Date('2026-10-15')
      },
      {
        userName: 'Rohan Mehta',
        rating: 5,
        comment: 'Exceptional instruction on spinal alignment and Surya Namaskar. Highly recommended for beginners!',
        createdAt: new Date('2026-10-20')
      }
    ],
    classes: [
      {
        title: 'Session 1: Foundational Alignment & Tadasana Breath',
        description: 'Understand grounding, foot placement, and core stabilization.',
        duration: '35 mins',
        thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Dynamic Surya Namaskār Flow (12 Postures)',
        description: 'Step-by-step breakdown of the classical Sun Salutation series.',
        duration: '45 mins',
        thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 3: Prāṇāyāma Fundamentals & Nadi Shodhana',
        description: 'Alternate nostril breathing technique for nervous system rejuvenation.',
        duration: '30 mins',
        thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 4: Restorative Yoga Nidrā for Restful Sleep',
        description: 'Deep guided conscious relaxation to dissolve bodily fatigue.',
        duration: '40 mins',
        thumbnail: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=600&q=80'
      }
    ]
  },
  {
    title: 'Vinyasa Flow: Strength, Agility & Core Balance',
    description: 'An energizing, fluid movement flow connecting conscious breath with dynamic posture transitions. Build muscular endurance, enhance joint mobility, and release mental tension.',
    category: 'Vinyasa Flow',
    level: 'Intermediate',
    price: 1999,
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80',
    duration: '6 Weeks • 18 Sessions',
    enrolledCount: 98,
    rating: 4.8,
    reviewsCount: 19,
    reviews: [
      {
        userName: 'Aarav Patel',
        rating: 5,
        comment: 'High energy yet profoundly grounding. My core strength and balance improved noticeably within 3 weeks.',
        createdAt: new Date('2026-10-18')
      }
    ],
    classes: [
      {
        title: 'Session 1: Awakening the Solar Plexus (Manipūra)',
        description: 'Core ignition series with Warrior transitions.',
        duration: '45 mins',
        thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Hip Opening & Deep Fluid Transitions',
        description: 'Pigeon variations and low lunge hip flexor opening.',
        duration: '50 mins',
        thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 3: Arm Balances: Bakasana (Crow) Mastery',
        description: 'Technique, wrist preparation, and weight distribution for effortless balances.',
        duration: '40 mins',
        thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80'
      }
    ]
  },
  {
    title: 'Kundalini Awakening & Chakra Energy Meditation',
    description: 'Tap into latent prāna and subtle energy channels through kriyas, mantra chants, breathwork, and deep visualization. Release stored emotional blocks and heighten conscious awareness.',
    category: 'Kundalini Yoga',
    level: 'All Levels',
    price: 2499,
    thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
    duration: '4 Weeks • 16 Sessions',
    enrolledCount: 210,
    rating: 4.95,
    reviewsCount: 45,
    reviews: [
      {
        userName: 'Sneha Kulkarni',
        rating: 5,
        comment: 'A truly transcendent spiritual journey. The breath of fire and chakra visualizations cleared so much anxiety.',
        createdAt: new Date('2026-10-22')
      }
    ],
    classes: [
      {
        title: 'Session 1: Awakening the Muladhara Root Energy',
        description: 'Grounding techniques and pelvic floor breath retention.',
        duration: '40 mins',
        thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Breath of Fire (Kapalabhati) Kriya',
        description: 'Purification of blood and energetic illumination.',
        duration: '35 mins',
        thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 3: Third Eye & Crown Chakra Chanting',
        description: 'Sacred sound frequencies and meditative stillness.',
        duration: '45 mins',
        thumbnail: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=600&q=80'
      }
    ]
  },
  {
    title: 'Ashtanga Primary Series: Strength & Stamina',
    description: 'Traditional Mysore-style Ashtanga Yoga sequence structured to build robust stamina, joint fortitude, and mental discipline following Sri K. Pattabhi Jois teachings.',
    category: 'Ashtanga',
    level: 'Advanced',
    price: 2999,
    thumbnail: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=800&q=80',
    duration: '8 Weeks • 24 Sessions',
    enrolledCount: 76,
    rating: 4.7,
    reviewsCount: 14,
    reviews: [
      {
        userName: 'Vikram Singh',
        rating: 5,
        comment: 'Intense and disciplined. Just what I needed to deepen my personal daily Sadhana.',
        createdAt: new Date('2026-10-25')
      }
    ],
    classes: [
      {
        title: 'Session 1: Standing Asana Series & Ujjayi Breath',
        description: 'Mastering the victorious ocean breath and drishti gaze.',
        duration: '55 mins',
        thumbnail: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Seated Forward Folds & Jump-backs',
        description: 'Vinyasa floating techniques and bandha engagement.',
        duration: '60 mins',
        thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80'
      }
    ]
  },
  {
    title: 'Mindfulness Meditation & Stress Relief Sanctuary',
    description: 'Scientific mindfulness protocols, guided Zen meditation, and nervous system de-escalation methods to reduce cortisol, dissolve stress, and promote mental clarity.',
    category: 'Meditation',
    level: 'All Levels',
    price: 999,
    thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
    duration: '3 Weeks • 10 Sessions',
    enrolledCount: 310,
    rating: 4.9,
    reviewsCount: 62,
    reviews: [
      {
        userName: 'Meera Nambiar',
        rating: 5,
        comment: 'Saved me during an intensely stressful month. The voice guidance and ambient acoustics are mesmerizing.',
        createdAt: new Date('2026-10-27')
      }
    ],
    classes: [
      {
        title: 'Session 1: Vipassana Body Scan for Tension Dissolution',
        description: 'Systematic somatic awareness from head to toe.',
        duration: '25 mins',
        thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Tibetan Singing Bowl Sound Immersion',
        description: 'Theta wave entrainment and deep harmonic vibration.',
        duration: '35 mins',
        thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80'
      }
    ]
  },
  {
    title: 'Pranayama Mastery: The Sacred Science of Breath',
    description: 'Comprehensive study of ancient yogic breathing mechanisms: Anulom Vilom, Bhastrika, Ujjayi, Sheetali, and Brahmari for immunity, lung capacity, and mental peace.',
    category: 'Pranayama',
    level: 'Beginner',
    price: 1199,
    thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=80',
    duration: '3 Weeks • 9 Sessions',
    enrolledCount: 185,
    rating: 4.85,
    reviewsCount: 37,
    reviews: [
      {
        userName: 'Aditya Gupta',
        rating: 5,
        comment: 'The clear biological explanations combined with authentic tradition made this the best course on pranayama I have taken.',
        createdAt: new Date('2026-10-29')
      }
    ],
    classes: [
      {
        title: 'Session 1: Diaphragmatic Breath & Posture Alignment',
        description: 'Re-training proper respiratory mechanics for modern life.',
        duration: '30 mins',
        thumbnail: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80'
      },
      {
        title: 'Session 2: Cooling & Calming: Sheetali & Brahmari',
        description: 'Instant autonomic downregulation for anger and heat reduction.',
        duration: '30 mins',
        thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80'
      }
    ]
  }
];

// Helper to seed courses if none exist
const ensureInitialCourses = async () => {
  const count = await Course.countDocuments();
  if (count === 0) {
    // Find or create an approved default trainer
    let defaultTrainer = await Trainer.findOne();
    if (!defaultTrainer) {
      defaultTrainer = await Trainer.create({
        name: 'Acharya Devavrata',
        email: 'acharya.trainer@yogazen.com',
        password: '$2a$10$e7m/examplePasswordHashedForDemoPurposesOnly1234',
        contact: '+91 98765 43210',
        bio: 'Yoga Shiromani with 15+ years of Rishikesh & Mysore classical yogic tradition. Dedicated to guiding seekers towards physical harmony and mindfulness.',
        categories: ['Hatha Yoga', 'Vinyasa Flow', 'Kundalini Yoga', 'Meditation', 'Pranayama'],
        experienceYears: 15,
        isApproved: true
      });
    }

    const coursesToInsert = DEFAULT_COURSES.map(c => ({
      ...c,
      trainer: defaultTrainer._id
    }));

    const inserted = await Course.insertMany(coursesToInsert);
    defaultTrainer.courses = inserted.map(c => c._id);
    await defaultTrainer.save();
  }
};

// Helper: Extract user optionally from token
const getOptionalUser = async (req) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return null;
    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.id) return null;
    const user = await User.findById(decoded.id).select('-password');
    return user;
  } catch (err) {
    return null;
  }
};

// @desc    Get all public courses with filtering, search, sorting & pagination
// @route   GET /courses
// @access  Public
exports.getAllCourses = async (req, res) => {
  try {
    await ensureInitialCourses();

    const {
      search,
      category,
      level,
      minPrice,
      maxPrice,
      rating,
      sort,
      page = 1,
      limit = 12
    } = req.query;

    const query = {};

    // Search filter
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex }
      ];
    }

    // Category filter
    if (category && category !== 'All' && category !== 'all') {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
    }

    // Level filter
    if (level && level !== 'All' && level !== 'All Levels') {
      query.level = level;
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) query.price.$lte = Number(maxPrice);
    }

    // Rating filter (e.g. 4+ stars)
    if (rating && Number(rating) > 0) {
      query.rating = { $gte: Number(rating) };
    }

    // Sort order
    let sortObj = { createdAt: -1 };
    if (sort === 'rating_desc') {
      sortObj = { rating: -1, reviewsCount: -1 };
    } else if (sort === 'price_asc') {
      sortObj = { price: 1 };
    } else if (sort === 'price_desc') {
      sortObj = { price: -1 };
    } else if (sort === 'students') {
      sortObj = { enrolledCount: -1 };
    } else if (sort === 'oldest') {
      sortObj = { createdAt: 1 };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate('trainer', 'name bio categories experienceYears email')
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit)),
      Course.countDocuments(query)
    ]);

    // Aggregate category counts for quick tab filters
    const allCoursesForCategories = await Course.find({}, 'category');
    const categoryCounts = allCoursesForCategories.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      categoryCounts,
      courses
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve courses',
      error: error.message
    });
  }
};

// @desc    Get course detail by ID with curriculum, trainer info and verified reviews
// @route   GET /courses/:id
// @access  Public (Optional User Auth to check enrollment)
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id).populate('trainer', 'name bio categories experienceYears email totalEarnings');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if the requesting user is enrolled
    let isEnrolled = false;
    let userReview = null;
    const user = await getOptionalUser(req);

    if (user) {
      // 1. Check user.enrolledCourses
      if (Array.isArray(user.enrolledCourses)) {
        isEnrolled = user.enrolledCourses.some(
          (e) => e.course && e.course.toString() === course._id.toString()
        );
      }

      // 2. Check Order collection for active course order
      if (!isEnrolled) {
        const order = await Order.findOne({
          user: user._id,
          orderType: 'course',
          'courseDetails.course': course._id,
          status: { $ne: 'Cancelled' }
        });
        if (order) isEnrolled = true;
      }

      // Find user's existing review if any
      if (Array.isArray(course.reviews)) {
        userReview = course.reviews.find(
          (r) => r.user && r.user.toString() === user._id.toString()
        ) || null;
      }
    }

    return res.status(200).json({
      success: true,
      course,
      isEnrolled,
      userReview
    });
  } catch (error) {
    console.error('Error fetching course details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve course details',
      error: error.message
    });
  }
};

// @desc    Submit or update a rating and review for a course (Enrolled Users Only)
// @route   POST /courses/:id/reviews
// @access  Protected (User)
exports.addCourseReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5 stars.'
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Review comment cannot be empty.'
      });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    // Verify enrollment: Must be enrolled in user.enrolledCourses OR have an Order
    let isEnrolled = false;
    if (Array.isArray(req.user.enrolledCourses)) {
      isEnrolled = req.user.enrolledCourses.some(
        (e) => e.course && e.course.toString() === course._id.toString()
      );
    }

    if (!isEnrolled) {
      const existingOrder = await Order.findOne({
        user: userId,
        orderType: 'course',
        $or: [
          { 'courseDetails.course': course._id },
          { 'courseDetails.title': course.title }
        ],
        status: { $ne: 'Cancelled' }
      });
      if (existingOrder) isEnrolled = true;
    }

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'Only students enrolled in this course can rate and submit reviews.'
      });
    }

    const reviewerName = req.user.name && req.user.name.trim() 
      ? req.user.name.trim() 
      : (req.user.email ? req.user.email.trim() : 'student@yogazen.com');

    // Check if user already reviewed
    const existingReviewIndex = course.reviews.findIndex(
      (r) => r.user && r.user.toString() === userId.toString()
    );

    if (existingReviewIndex !== -1) {
      // Update existing review
      course.reviews[existingReviewIndex].rating = Number(rating);
      course.reviews[existingReviewIndex].comment = comment.trim();
      course.reviews[existingReviewIndex].userName = reviewerName;
      course.reviews[existingReviewIndex].createdAt = new Date();
    } else {
      // Push new review
      course.reviews.push({
        user: userId,
        userName: reviewerName,
        rating: Number(rating),
        comment: comment.trim(),
        createdAt: new Date()
      });
    }

    // Recalculate average rating
    const totalRating = course.reviews.reduce((sum, r) => sum + r.rating, 0);
    course.rating = Number((totalRating / course.reviews.length).toFixed(1));
    course.reviewsCount = course.reviews.length;

    await course.save();

    return res.status(200).json({
      success: true,
      message: existingReviewIndex !== -1 ? 'Review updated successfully!' : 'Thank you for rating and reviewing this course!',
      rating: course.rating,
      reviewsCount: course.reviewsCount,
      reviews: course.reviews
    });
  } catch (error) {
    console.error('Error submitting course review:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit course review',
      error: error.message
    });
  }
};

// @desc    Direct instant enrollment / purchase of a course
// @route   POST /courses/:id/enroll
// @access  Protected (User)
exports.enrollInCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { couponCode, paymentMethod } = req.body;
    const user = req.user;

    const course = await Course.findById(id).populate('trainer');
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    // Check if already enrolled
    const alreadyEnrolled = (user.enrolledCourses || []).some(
      (e) => e.course && e.course.toString() === course._id.toString()
    );

    if (alreadyEnrolled) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course! Head to your profile studio to begin practice.'
      });
    }

    const subtotal = course.price;
    let discount = 0;

    // Apply coupon if given
    if (couponCode && couponCode.trim()) {
      const Coupon = Order.Coupon;
      if (Coupon) {
        const dbCoupon = await Coupon.findOne({
          code: couponCode.trim().toUpperCase(),
          isActive: true
        });
        if (dbCoupon && (!dbCoupon.expiresAt || new Date() <= new Date(dbCoupon.expiresAt))) {
          if (dbCoupon.discountType === 'percent') {
            discount = Math.round((subtotal * dbCoupon.discountValue) / 100);
            if (dbCoupon.maxDiscount && discount > dbCoupon.maxDiscount) {
              discount = dbCoupon.maxDiscount;
            }
          } else if (dbCoupon.discountType === 'flat') {
            discount = Math.min(subtotal, dbCoupon.discountValue);
          }
          await Coupon.updateOne({ _id: dbCoupon._id }, { $inc: { usageCount: 1 } });
        }
      }
    }

    const totalAmount = Math.max(0, subtotal - discount);
    const invoiceId = `YZ-INV-${Math.floor(10000 + Math.random() * 90000)}`;
    const orderNumber = `YZ-ORD-CRS-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder = new Order({
      user: user._id,
      orderNumber,
      invoiceId,
      orderType: 'course',
      courseDetails: {
        course: course._id,
        title: course.title,
        trainer: course.trainer?.name || 'YogaZen Master',
        category: course.category,
        validity: 'Lifetime Access'
      },
      courseProgress: {
        completedClasses: [],
        progressPercentage: 0
      },
      subtotal,
      couponCode: (couponCode || '').trim().toUpperCase(),
      discountAmount: discount,
      shippingFee: 0,
      totalAmount,
      status: 'Active',
      paymentStatus: 'Paid',
      paymentMethod: paymentMethod || 'Instant Mindful Enrollment'
    });

    await newOrder.save();

    // Add to user enrolledCourses
    user.enrolledCourses.push({
      course: course._id,
      invoiceId,
      amountPaid: totalAmount,
      enrolledAt: new Date()
    });
    await user.save();

    // Increment course enrolled count & update trainer earnings
    course.enrolledCount = (course.enrolledCount || 0) + 1;
    await course.save();

    if (course.trainer) {
      // Trainer receives 80% of course price (20% platform commission deducted)
      const instructorNet = Math.round(totalAmount * 0.80);
      await Trainer.updateOne(
        { _id: course.trainer._id || course.trainer },
        { $inc: { totalEarnings: instructorNet } }
      );
    }

    return res.status(201).json({
      success: true,
      message: `Enrolled successfully in ${course.title}!`,
      order: newOrder,
      invoiceId
    });
  } catch (error) {
    console.error('Error enrolling in course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enroll in course',
      error: error.message
    });
  }
};

