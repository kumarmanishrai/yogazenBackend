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