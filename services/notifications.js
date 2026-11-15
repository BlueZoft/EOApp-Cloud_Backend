const nodemailer = require('nodemailer');
function notificationText(doc) {
  return `Inquiry reference: ${doc.id}\nLoan: ${doc.askLoan}\nName: ${doc.name}\nTelephone: ${doc.telephone}\nEmail: ${doc.email || '(not provided)'}\nPreferred branch: ${doc.branch}\nInquiry: ${doc.message || '(none)'}`;
}
function createNotificationWorker(Model, config, transport = null) {
  const mailer = transport || (config.smtpEnabled ? nodemailer.createTransport(config.smtp) : null);
  let timer, running = false;
  async function tick() {
    if (!mailer || running) return;
    running = true;
    let doc;
    try {
      const now = new Date();
      doc = await Model.findOneAndUpdate({ $or: [
        { 'notification.status': 'pending', 'notification.nextAttemptAt': { $lte: now } },
        { 'notification.status': 'processing', 'notification.leaseUntil': { $lte: now } },
      ] }, { $set: { 'notification.status': 'processing', 'notification.leaseUntil': new Date(Date.now() + 120000) },
        $inc: { 'notification.attempts': 1 } }, { returnDocument: 'after' });
      if (!doc) return;
      await mailer.sendMail({ from: config.mailFrom, to: doc.notification.recipient || config.mailTo,
        subject: `Entrepreneur inquiry ${doc.id}`, text: notificationText(doc),
        messageId: `<inquiry-${doc.id}@eoapp.local>` });
      await Model.updateOne({ _id: doc._id }, { $set: { 'notification.status': 'sent' }, $unset: { 'notification.leaseUntil': 1 } });
    } catch {
      // Never log SMTP errors or payloads: they may contain credentials or PII.
      console.error('Notification attempt failed; retry scheduled');
      if (doc) await Model.updateOne({ _id: doc._id }, { $set: { 'notification.status': 'pending',
        'notification.nextAttemptAt': new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(doc.notification.attempts, 7))) },
        $unset: { 'notification.leaseUntil': 1 } }).catch(() => console.error('Notification retry persistence failed'));
    } finally { running = false; }
  }
  return { tick, start() { if (mailer && !timer) { timer = setInterval(tick, 5000); timer.unref(); void tick(); } },
    stop() { clearInterval(timer); timer = null; } };
}
module.exports = { createNotificationWorker, notificationText };
