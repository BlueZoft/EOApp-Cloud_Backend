const mongoose = require('mongoose')

const userSchema = mongoose.Schema({

    Name: {
        type: String,
        required: [true],
    },
    Age: {
        type: Number,
        required: [true]
    },
    NIC: {
        type: String,
        required: [true],
    },  
    Sex: {
        type: String,
        required: [true]
    },
    Telephone: {
        type: String,
    },
    Address: {
        type: String,
        required: [true],
    },
    email: {
        type: String,
        lowercase: true,  
    },
    Inquiry: {
        type: String,
        maxLength: 500,
    },
    Branch: {
        type: String,
    },
    askLoan: {
        type: String,
    },
}, 
{timestamps: true}
)

module.exports = mongoose.model('User', userSchema) 