const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:{
        type: String,
    },
    email:{
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        minlength: 6,
        required: true,
    },
    jwtToken: {
        type: String,
        unique: true,
    },
    contact:{
        type: String,
    },
    address:[
        {
            field1: {
                type: String,
                required: true,
            },
            field2: {
                type: String,
            },
            landmark: {
                type: String,
            },
            state:{
                type: String,
                required: true,
            },
            country: {
                type: String,
                required: true,
            }, 
            pincode: {
                type: String,
                required: true,
            },
            contact: {
                type: String,
                required: true,
            },
        }
    ],
    enrolledCourses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            timestamp:{
                type: Date,
                default: Date.now,
            },
        }
    ],

})

module.exports = mongoose.model("User", userSchema)