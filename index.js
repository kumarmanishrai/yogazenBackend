require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongo = require('./src/db/mongo')
const app = express();
const PORT = process.env.PORT || 5000;

const userRoute = require('./src/routes/userRoute')
const trainerRoute = require('./src/routes/trainerRoute')

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({urlencoded: true}));

app.use(cors({
    origin: '*',
    method: ['GET','HEAD', 'POST', 'UPDATE', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}))


mongo.on('error', console.error.bind(console, "Couldn't connect mongodb to server"))
mongo.once('open', ()=> {
    console.log("MongoDB connected successfully")
})

app.get('/check', (req, res)=> {
    res.send("Server is is up and running");
})

//user route
app.use('/user', userRoute);

//trainer route
app.use('/trainer',trainerRoute);


app.listen(PORT, (req, res)=> {
    console.log(`Server is running on: localhost:${PORT}`);
})