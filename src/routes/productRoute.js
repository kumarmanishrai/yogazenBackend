const express = require('express');
const router = express.Router();
const productController = require('../controller/productController');

// GET /products - List all products with search, filters, pagination, sort
router.get('/', productController.getProducts);

// GET /products/categories - List unique categories with counts
router.get('/categories', productController.getCategories);

// GET /products/:id - Single product with varieties & reviews
router.get('/:id', productController.getProductById);

// GET /products/:id/similar - Similar products in category
router.get('/:id/similar', productController.getSimilarProducts);

// POST /products/:id/reviews - Submit review
router.post('/:id/reviews', productController.addReview);

module.exports = router;

