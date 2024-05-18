const express = require('express')
const router = express.Router()
const{setData} = require('../Controllers/Controller')


router.post('/', setData)



module.exports = router