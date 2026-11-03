const dotenv = require('dotenv');
dotenv.config();

const dns = require('dns');
// Set public DNS servers (Google & Cloudflare) to ensure reliable MongoDB Atlas SRV record resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // Fallback to default system resolver if custom DNS cannot be set
}

const mongoose = require("mongoose");
mongoose.set('strictQuery', false);

mongoose
    .connect(process.env.MONGO_URI)
    .catch(err => {
        console.log("Connection error: "+ err.message);
    })

const mongo = mongoose.connection

module.exports = mongo