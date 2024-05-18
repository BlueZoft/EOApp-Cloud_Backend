const asyncHandler = require('express-async-handler')
const User = require('../Models/userModel')
const nodemailer = require ("nodemailer")


const setData = asyncHandler(async (req, res) => {

const user = new User({
    Name: req.body.name,
    Age: req.body.age,
    NIC: req.body.NIC,
    Sex: req.body.sex,
    Telephone: req.body.tel,
    Address: req.body.addr,
    email: req.body.email,
    Inquiry: req.body.inquiry,
    Branch:req.body.branch,
    askLoan:req.body.askLoan
})

await user.save();

let salut;
if (req.body.sex === 'female') { 
    salut = "Ms";
} else { 
    salut = "Mr";
} 

const mail =  
    `Name: ${salut} ${user.Name}\n` +
    `Age: ${user.Age}\n` +
    `Telephone Number: ${user.Telephone}\n` +
    `Address: ${user.Address}\n` +
    `Nearest Branch: ${user.Branch}\n` +
    `Inquiries: ${user.Inquiry}`


let transporter = nodemailer.createTransport({ 
    host: "mail.ariya.lk", 
    port: 465, 
    secure: true,  
    auth: { 
        user: 'hetarata@ariya.lk',  
        pass: 'RDb82_killaz', 
    }, 
    tls:{ 
        rejectUnauthorized:false 
    } 
}); 

let info = await transporter.sendMail({ 
    from: '"Entrepreneur Outreach App" <hetarata@ariya.lk>',  
    to: "akilaariyathilaka@gmail.com",  
    subject: "Entrepreneur Inquiry",  
    text: mail ,  
});


console.log(" Response : User", user)

if (user) {
    res.status(200).json(user);
} else {
    res.status(404).send('User not found');
}

  
   
})


module.exports = {setData}