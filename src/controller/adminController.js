const Admin = require('../models/adminSchema');
const Trainer = require('../models/trainerSchema');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');
const mongoose = require('mongoose');

exports.login = async (req, res) => {
  res.status(501).json({ message: 'Admin login endpoint not yet implemented' });
};

exports.getProfile = async (req, res) => {
  res.status(501).json({ message: 'Get admin profile endpoint not yet implemented' });
};

exports.updateProfile = async (req, res) => {
  res.status(501).json({ message: 'Update admin profile endpoint not yet implemented' });
};

exports.updatePassword = async (req, res) => {
  res.status(501).json({ message: 'Update admin password endpoint not yet implemented' });
};

exports.getDashboardStats = async (req, res) => {
  res.status(501).json({ message: 'Get dashboard stats endpoint not yet implemented' });
};

exports.getAnalytics = async (req, res) => {
  res.status(501).json({ message: 'Get analytics endpoint not yet implemented' });
};

exports.getAllUsers = async (req, res) => {
  res.status(501).json({ message: 'Get all users endpoint not yet implemented' });
};

exports.getUserById = async (req, res) => {
  res.status(501).json({ message: 'Get user by id endpoint not yet implemented' });
};

exports.deleteUser = async (req, res) => {
  res.status(501).json({ message: 'Delete user endpoint not yet implemented' });
};

exports.getAllTrainers = async (req, res) => {
  res.status(501).json({ message: 'Get all trainers endpoint not yet implemented' });
};

exports.getPendingTrainers = async (req, res) => {
  res.status(501).json({ message: 'Get pending trainers endpoint not yet implemented' });
};

exports.updateTrainerApproval = async (req, res) => {
  res.status(501).json({ message: 'Update trainer approval endpoint not yet implemented' });
};

exports.deleteTrainer = async (req, res) => {
  res.status(501).json({ message: 'Delete trainer endpoint not yet implemented' });
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

