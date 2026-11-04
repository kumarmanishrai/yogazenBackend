require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mongo = require('./src/db/mongo');
const seedSuperAdmin = require('./src/helper/seedSuperAdmin');
const app = express();
const PORT = process.env.PORT || 5000;

const userRoute = require('./src/routes/userRoute');
const trainerRoute = require('./src/routes/trainerRoute');
const adminRoute = require('./src/routes/adminRoute');
const cartRoute = require('./src/routes/cartRoute');
const wishlistRoute = require('./src/routes/wishlistRoute');
const productRoute = require('./src/routes/productRoute');
const courseRoute = require('./src/routes/courseRoute');
const orderRoute = require('./src/routes/orderRoute');
const complaintRoute = require('./src/routes/complaintRoute');
const analyticsRoute = require('./src/routes/analyticsRoute');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
  'https://yogazen-web.netlify.app',
  'http://localhost:3000',
  ...(process.env.URL ? [process.env.URL.trim()] : [])
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl) or if in whitelist
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

mongo.on('error', console.error.bind(console, "Couldn't connect mongodb to server"));
mongo.once('open', () => {
  console.log('MongoDB connected successfully');
  seedSuperAdmin();
});

app.get('/check', (req, res) => {
  res.send('Server is up and running');
});

// User route
app.use('/user', userRoute);

// Cart routes
app.use('/cart', cartRoute);
app.use('/user/cart', cartRoute);

// Wishlist routes
app.use('/wishlist', wishlistRoute);
app.use('/user/wishlist', wishlistRoute);

// Products route (Public Store)
app.use('/products', productRoute);

// Courses route (Public Catalog & Reviews)
app.use('/courses', courseRoute);

// Orders route
app.use('/orders', orderRoute);

// Complaints & Support route
app.use('/complaints', complaintRoute);

// Telemetry & Recommendation Analytics route
app.use('/analytics', analyticsRoute);

// Trainer route
app.use('/trainer', trainerRoute);

// Admin route
app.use('/admin', adminRoute);

app.listen(PORT, () => {
  console.log(`Server is running on: localhost:${PORT}`);
});
