const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 100 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'officer'], required: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  failedLogins: { type: Number, default: 0 }, lockedUntil: Date,
  active: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Staff', schema);
