const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    userName: {
        type: String,
        required: true,
        trim: true,
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    comment: {
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

const classSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    thumbnail: {
        type: String,
        default: ''
    },
    duration: {
        type: String,
        default: '45 mins'
    },
    scheduledAt: {
        type: Date,
        default: Date.now
    },
    type: {
        type: String,
        enum: ['Live Stream', 'Recorded', 'Interactive Workshop'],
        default: 'Live Stream'
    },
    meetingUrl: {
        type: String,
        default: ''
    },
    videoUrl: {
        type: String,
        default: ''
    },
    youtubeVideoId: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['scheduled', 'live', 'completed'],
        default: 'scheduled'
    },
    isLive: {
        type: Boolean,
        default: false
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    },
    recordingUrl: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const courseSchema = new mongoose.Schema({
    trainer:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Trainer",
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: ''
    },
    category: {
        type: String,
        default: 'Hatha Yoga'
    },
    level: {
        type: String,
        default: 'All Levels'
    },
    price: {
        type: Number,
        default: 0
    },
    thumbnail: {
        type: String,
        default: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=80'
    },
    duration: {
        type: String,
        default: '4 Weeks'
    },
    enrolledCount: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    reviewsCount: {
        type: Number,
        default: 0
    },
    reviews: [reviewSchema],
    isPublished: {
        type: Boolean,
        default: true
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['published', 'under_review', 'draft', 'archived'],
        default: 'published'
    },
    createdOn:{
        type: Date,
        default: Date.now
    },
    classes: [classSchema]
}, { timestamps: true });

module.exports = mongoose.model("Course", courseSchema);
