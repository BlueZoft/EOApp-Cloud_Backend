const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { validateInquiry } = require('../validation/inquiry');
const { createNotificationWorker, notificationText } = require('../services/notifications');
const { rateLimit } = require('../Middleware/rateLimit');
const Model = require('../Models/inquiryModel');
const payload = { name: 'Test Person', age: 30, nic: '199012345678', sex: 'female', telephone: '0771234567', address: 'Test address', email: '', message: 'Test inquiry', loanId: 'loan-01', branchId: 'branch-001', consent: true };
const config = { ...loadConfig({}), smtpEnabled: true };
test('rejects invalid age, choices, contact details and missing consent', () => {
  for (const patch of [{ age: 'abc' }, { age: 17 }, { age: 30.5 }, { loanId: 'bad' }, { branchId: 'bad' }, { telephone: 'no' }, { nic: 'no' }, { sex: '' }, { consent: false }, { name: {} }, { email: 'a@b' }]) assert.throws(() => validateInquiry({ ...payload, ...patch }), { status: 422 });
});
test('SMTP defaults off and requires complete configuration when enabled', () => {
  assert.equal(loadConfig({}).smtpEnabled, false); assert.throws(() => loadConfig({ SMTP_ENABLED: 'true' }), /incomplete/);
});
test('notification includes loan and reference but omits NIC', () => {
  const body = notificationText({ ...payload, id: 'ref', askLoan: 'Loan', branch: 'Branch' });
  assert.match(body, /Loan: Loan/); assert.match(body, /reference: ref/); assert.ok(!body.includes(payload.nic));
});
const integration = process.env.TEST_MONGO_URI ? test : test.skip;
let server, base;
before(async () => {
  if (!process.env.TEST_MONGO_URI) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `eoapp_test_${process.pid}_${Date.now()}`, serverSelectionTimeoutMS: 5000 });
  await Model.init();
  server = createApp(config, { limiter: rateLimit({ limit: 100 }) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();
});
const post = (body, key = 'test-submission-key-001', extra = {}) => fetch(`${base}/api/v1/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra }, body: JSON.stringify(body) });
integration('validation returns 422 and saves nothing', async () => {
  const res = await post({}); assert.equal(res.status, 422); assert.equal((await res.json()).error.code, 'VALIDATION_ERROR'); assert.equal(await Model.countDocuments(), 0);
});
integration('CORS works on preflight and POST and rejects unapproved origins', async () => {
  const res = await fetch(`${base}/api/v1/inquiries`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Idempotency-Key,Content-Type' } });
  assert.equal(res.status, 204); assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const invalid = await post({}, 'test-submission-cors', { Origin: 'http://localhost:8080' }); assert.equal(invalid.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  assert.equal((await post(payload, 'test-submission-cors', { Origin: 'https://unapproved.test' })).status, 403);
});
integration('concurrent duplicate submissions save once; changed payload conflicts', async () => {
  const responses = await Promise.all(Array.from({ length: 4 }, () => post(payload)));
  assert.deepEqual(responses.map(x => x.status).sort(), [200, 200, 200, 201]);
  const receipts = await Promise.all(responses.map(x => x.json())); assert.equal(new Set(receipts.map(x => x.inquiry.reference)).size, 1);
  assert.deepEqual(Object.keys(receipts[0].inquiry).sort(), ['reference', 'status']);
  assert.equal(await Model.countDocuments({ submissionKey: 'test-submission-key-001' }), 1);
  assert.equal((await post({ ...payload, message: 'changed' })).status, 409);
});
integration('SMTP failure retains inquiry and retry succeeds without another submission', async () => {
  const doc = await Model.findOne({ submissionKey: 'test-submission-key-001' }); let attempts = 0;
  const worker = createNotificationWorker(Model, config, { async sendMail(mail) { attempts++; assert.ok(mail.text.includes(doc.askLoan)); if (attempts === 1) throw new Error('simulated'); } });
  await worker.tick(); let updated = await Model.findById(doc._id); assert.equal(updated.notification.status, 'pending'); assert.equal(updated.notification.attempts, 1);
  await Model.updateOne({ _id: doc._id }, { $set: { 'notification.nextAttemptAt': new Date(0) } });
  await worker.tick(); await worker.tick(); updated = await Model.findById(doc._id); assert.equal(updated.notification.status, 'sent'); assert.equal(attempts, 2);
});
integration('legacy endpoint accepts old fields and returns minimal receipt', async () => {
  const catalogue = require('../data/catalogue.json');
  const res = await fetch(`${base}/api/userdata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: payload.name, age: '30', NIC: payload.nic, sex: 'female', tel: payload.telephone, addr: payload.address, email: '', inquiry: '', branch: catalogue.branches[0].name, askLoan: catalogue.loans[0].lName }) });
  assert.equal(res.status, 200); assert.equal(res.headers.get('deprecation'), 'true'); assert.equal((await res.json()).inquiry.status, 'received');
});
integration('malformed JSON, oversized bodies, missing key and unknown routes', async () => {
  assert.equal((await fetch(`${base}/api/v1/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await post(payload, '')).status, 400); assert.equal((await post({ ...payload, message: 'a'.repeat(20000) })).status, 413); assert.equal((await fetch(`${base}/missing`)).status, 404);
});
integration('readiness and submission fail when database unavailable; rate limit supplies retry interval', async () => {
  const isolated = createApp(config, { ready: () => false, limiter: rateLimit({ limit: 1 }) }).listen(0, '127.0.0.1');
  await new Promise(resolve => isolated.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${isolated.address().port}`; assert.equal((await fetch(`${url}/ready`)).status, 503);
    const req = () => fetch(`${url}/api/v1/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await req()).status, 503); const res = await req(); assert.equal(res.status, 429); assert.ok(res.headers.has('retry-after'));
  } finally { await new Promise(resolve => isolated.close(resolve)); }
});
integration('expired notification leases recover and competing workers claim once', async () => {
  await Model.updateMany({}, { $set: { 'notification.status': 'disabled' } });
  const doc = await Model.create({ ...validateInquiry(payload), submissionKey: 'lease-test-submission',
    notification: { status: 'processing', leaseUntil: new Date(0), attempts: 1 } });
  let sends = 0;
  const transport = { async sendMail() { sends++; } };
  const first = createNotificationWorker(Model, config, transport);
  const second = createNotificationWorker(Model, config, transport);
  await Promise.all([first.tick(), second.tick()]);
  assert.equal(sends, 1); assert.equal((await Model.findById(doc._id)).notification.status, 'sent');
});
test('database write failure returns 500 without internal details or false receipt', async () => {
  const failingModel = { async findOne() { throw new Error('private-database-details'); } };
  const isolated = createApp(config, { Model: failingModel, ready: () => true }).listen(0, '127.0.0.1');
  await new Promise(resolve => isolated.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${isolated.address().port}/api/v1/inquiries`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'failure-test-key-0001' }, body: JSON.stringify(payload) });
    assert.equal(res.status, 500); const body = await res.json();
    assert.equal(body.error.code, 'INTERNAL_ERROR'); assert.ok(!JSON.stringify(body).includes('private-database-details')); assert.equal(body.inquiry, undefined);
  } finally { await new Promise(resolve => isolated.close(resolve)); }
});
