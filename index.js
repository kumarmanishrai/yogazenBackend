require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mongo = require('./src/db/mongo');
const app = express();
const PORT = process.env.PORT || 5000;

const userRoute = require('./src/routes/userRoute');
const trainerRoute = require('./src/routes/trainerRoute');
const adminRoute = require('./src/routes/adminRoute');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
  origin: process.env.URL || 'http://localhost:3000',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

mongo.on('error', console.error.bind(console, "Couldn't connect mongodb to server"));
mongo.once('open', () => {
  console.log('MongoDB connected successfully');
});

app.get('/check', (req, res) => {
  res.send('Server is up and running');
});

// User route
app.use('/user', userRoute);

// Trainer route
app.use('/trainer', trainerRoute);

// Admin route
app.use('/admin', adminRoute);

app.listen(PORT, () => {
  console.log(`Server is running on: localhost:${PORT}`);
});
