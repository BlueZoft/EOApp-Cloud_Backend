const express = require('express')
const colors = require('colors')
const dotenv = require('dotenv').config()
const{errorHandler} = require('./Middleware/errorMiddleware')
const connectDB = require('./Config/db')
const serverless = require('serverless-http')

const port =  5000
const cors = require('cors')

connectDB()

const app = express()
app.use(express.json())
app.use(express.urlencoded({extended: false}))
app.use('/api/userdata', require('./Routes/userRoute'))
app.use(cors()); 
app.use(errorHandler)
app.listen(port, () => console.log(`Server started on port ${port}`))
module.exports.handler = serverless(app)