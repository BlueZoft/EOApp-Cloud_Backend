const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
  authVersion: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
module.exports = mongoose.model('StaffSession', schema);
