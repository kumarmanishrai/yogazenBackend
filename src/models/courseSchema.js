const mongoose = require('mongoose');

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
    createdOn:{
        type: Date,
        default: Date.now
    },
    classes:[
        {
            title:{
                type: String,
                required: true,
            },
            description: {
                type: String,
            },
            thumbnail: {
                type: String,
            },


        }
    ]
})

module.exports = mongoose.model("Course", courseSchema);