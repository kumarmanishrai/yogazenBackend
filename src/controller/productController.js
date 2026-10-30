const mongoose = require('mongoose');
const Product = require('../models/productSchema');

// @desc    Get all public store products with filters, sorting & pagination
// @route   GET /products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      inStock,
      sort,
      page = 1,
      limit = 12
    } = req.query;

    const query = { isAvailable: true };

    // Search query (title or description)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }, { category: searchRegex }];
    }

    // Category filter
    if (category && category !== 'All') {
      // Support matching category name (e.g., "Yoga Mats", "Meditation & Rest")
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
    }

    // Price range filter (checking discountPrice if present, or price)
    if (minPrice || maxPrice) {
      query.$and = query.$and || [];
      const min = parseFloat(minPrice);
      const max = parseFloat(maxPrice);

      if (!isNaN(min)) {
        query.$and.push({
          $or: [
            { discountPrice: { $gte: min } },
            { $and: [{ discountPrice: null }, { price: { $gte: min } }] }
          ]
        });
      }
      if (!isNaN(max)) {
        query.$and.push({
          $or: [
            { discountPrice: { $lte: max } },
            { $and: [{ discountPrice: null }, { price: { $lte: max } }] }
          ]
        });
      }
    }

    // In-stock filter
    if (inStock === 'true' || inStock === true) {
      query.stock = { $gt: 0 };
    }

    // Sorting
    let sortOptions = { createdAt: -1 }; // default: newest
    if (sort === 'price_asc') {
      sortOptions = { discountPrice: 1, price: 1 };
    } else if (sort === 'price_desc') {
      sortOptions = { discountPrice: -1, price: -1 };
    } else if (sort === 'rating') {
      sortOptions = { rating: -1, reviewsCount: -1 };
    } else if (sort === 'popular') {
      sortOptions = { reviewsCount: -1, rating: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 12);
    const skip = (pageNum - 1) * limitNum;

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limitNum) || 1;

    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    return res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      products
    });
  } catch (error) {
    console.error('Error in getProducts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve products',
      error: error.message
    });
  }
};

// @desc    Get store categories with product counts
// @route   GET /products/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $match: { isAvailable: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          image: { $first: '$thumbnail' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const formatted = categories.map((c) => ({
      name: c._id,
      count: c.count,
      image: c.image
    }));

    return res.status(200).json({
      success: true,
      categories: formatted
    });
  } catch (error) {
    console.error('Error in getCategories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve categories',
      error: error.message
    });
  }
};

// @desc    Get single product details by ID (including varieties & reviews)
// @route   GET /products/:id
// @access  Public
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
        message: 'Product not found'
      });
    }

    return res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error in getProductById:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve product details',
      error: error.message
    });
  }
};

// @desc    Get dynamically related / similar products in the same category
// @route   GET /products/:id/similar
// @access  Public
exports.getSimilarProducts = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const targetProduct = await Product.findById(id);
    if (!targetProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Find other products in same category (or fallback to any if category has few)
    let similar = await Product.find({
      _id: { $ne: targetProduct._id },
      category: targetProduct.category,
      isAvailable: true
    })
      .sort({ rating: -1, stock: -1 })
      .limit(6);

    if (similar.length < 4) {
      const extra = await Product.find({
        _id: { $nin: [targetProduct._id, ...similar.map((s) => s._id)] },
        isAvailable: true
      })
        .sort({ rating: -1 })
        .limit(6 - similar.length);
      similar = [...similar, ...extra];
    }

    return res.status(200).json({
      success: true,
      count: similar.length,
      similarProducts: similar
    });
  } catch (error) {
    console.error('Error in getSimilarProducts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve similar products',
      error: error.message
    });
  }
};

// @desc    Add review & rating to product
// @route   POST /products/:id/reviews
// @access  Protected (isValidUser) or Public with user name
exports.addReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, name } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Product ID format'
      });
    }

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5'
      });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Review comment is required'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const reviewerName = (name || req.user?.name || req.user?.email?.split('@')[0] || 'Mindful Practitioner').trim();

    const newReview = {
      user: req.user?._id || null,
      name: reviewerName,
      rating: numRating,
      comment: comment.trim(),
      createdAt: new Date()
    };

    product.reviews.unshift(newReview);
    product.reviewsCount = product.reviews.length;

    // Recalculate average star rating
    const totalScore = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    product.rating = Math.round((totalScore / product.reviewsCount) * 10) / 10;

    await product.save();

    return res.status(201).json({
      success: true,
      message: 'Review posted successfully',
      reviewsCount: product.reviewsCount,
      rating: product.rating,
      reviews: product.reviews
    });
  } catch (error) {
    console.error('Error adding product review:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to post review',
      error: error.message
    });
  }
};

