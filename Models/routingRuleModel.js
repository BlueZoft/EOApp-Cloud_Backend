const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  loanId: { type: String, default: '*' }, branchId: { type: String, default: '*' },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
}, { timestamps: true });
schema.index({ loanId: 1, branchId: 1 }, { unique: true });
module.exports = mongoose.model('RoutingRule', schema);
