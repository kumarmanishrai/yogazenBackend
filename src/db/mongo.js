const dotenv = require('dotenv');
dotenv.config();

const mongoose = require("mongoose");
mongoose.set('strictQuery', false);

mongoose
    .connect(process.env.MONGO_URI)
    .catch(err => {
        console.log("Connection error: "+ err.message);
    })

const mongo = mongoose.connection

module.exports = mongo