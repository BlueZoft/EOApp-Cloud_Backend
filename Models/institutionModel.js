const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 160 },
  notificationEmail: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Institution', schema);
