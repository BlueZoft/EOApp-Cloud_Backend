const mongoose = require('mongoose');
// Preserve the existing users collection and field names; new code uses aliases.
const schema = new mongoose.Schema({
  Name: { type: String, required: true, alias: 'name' },
  Age: { type: Number, required: true, min: 18, max: 99, alias: 'age' },
  NIC: { type: String, required: true, alias: 'nic' },
  Sex: { type: String, enum: ['male', 'female'], required: true, alias: 'sex' },
  Telephone: { type: String, required: true, alias: 'telephone' },
  Address: { type: String, required: true, alias: 'address' },
  email: { type: String, lowercase: true },
  Inquiry: { type: String, maxlength: 500, alias: 'message' },
  Branch: { type: String, required: true, alias: 'branch' },
  askLoan: { type: String, required: true },
  consent: Boolean,
  loanId: String, branchId: String, catalogueVersion: Number,
  submissionKey: String, payloadHash: String,
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  workflowStatus: { type: String, enum: ['new', 'assigned', 'contacted', 'closed'], default: 'new' },
  workflowVersion: { type: Number, default: 0 },
  assignedOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
  history: [{ _id: false, at: Date, actorId: mongoose.Schema.Types.ObjectId, actorName: String,
    action: String, status: String, institutionId: mongoose.Schema.Types.ObjectId }],
  notification: {
    recipient: String,
    status: { type: String, enum: ['pending', 'processing', 'sent', 'disabled'] },
    attempts: { type: Number, default: 0 }, nextAttemptAt: Date, leaseUntil: Date,
  },
}, { timestamps: true, collection: 'users' });
schema.index({ institutionId: 1, workflowStatus: 1, _id: -1 });
schema.index({ submissionKey: 1 }, { unique: true, partialFilterExpression: { submissionKey: { $type: 'string' } } });
schema.index({ 'notification.status': 1, 'notification.nextAttemptAt': 1 });
schema.index({ 'notification.status': 1, 'notification.leaseUntil': 1 });
module.exports = mongoose.model('Inquiry', schema);
