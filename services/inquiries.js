const { createHash } = require('node:crypto');
function createInquiryService(Model, smtpEnabled) {
  return async (payload, submissionKey) => {
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const check = doc => {
      if (doc.payloadHash !== payloadHash) throw Object.assign(new Error('This submission key was already used for different details'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      return { doc, replay: true };
    };
    const existing = await Model.findOne({ submissionKey });
    if (existing) return check(existing);
    try {
      const doc = await Model.create({ ...payload, submissionKey, payloadHash,
        notification: { status: smtpEnabled ? 'pending' : 'disabled', attempts: 0, nextAttemptAt: new Date() } });
      return { doc, replay: false };
    } catch (error) {
      if (error.code !== 11000) throw error;
      const winner = await Model.findOne({ submissionKey });
      if (!winner) throw error;
      return check(winner);
    }
  };
}
module.exports = { createInquiryService };
