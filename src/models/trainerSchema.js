
const mongoose = require('mongoose');

const trainerSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
    },
    email: {
        type: String, 
        unique: true,
        required: true,
    },
    password: {
        type: String, 
        required: true,
    },
    jwtToken: {
        type: String,
        unique: true,
    },
    contact:{
        type: String,
    },
    courses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
        },
    ]
    
})

module.exports = mongoose.model("Trainer", trainerSchema);