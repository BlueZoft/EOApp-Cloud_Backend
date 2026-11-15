const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
const { hashPassword, verifyPassword, cookieOptions, digest } = require('../services/staffAuth');
const { importDirectory, provisionStaff, disableStaff, validateDirectory } = require('../services/provisioning');
const Inquiry = require('../Models/inquiryModel');
const Institution = require('../Models/institutionModel');
const Rule = require('../Models/routingRuleModel');
const Staff = require('../Models/staffModel');
const Session = require('../Models/staffSessionModel');
const { createNotificationWorker } = require('../services/notifications');
const config = loadConfig({ STAFF_ENABLED: 'true', NODE_ENV: 'development', STAFF_COOKIE_SECURE: 'false' });
const password = 'local-test-' + randomUUID();
const directory = { institutions: [
  { code: 'test-a', name: 'Synthetic institution A', notificationEmail: 'team-a@local.test' },
  { code: 'test-b', name: 'Synthetic institution B', notificationEmail: 'team-b@local.test' },
], rules: [
  { loanId: 'loan-01', branchId: 'branch-001', institutionCode: 'test-a' },
  { loanId: 'loan-01', branchId: '*', institutionCode: 'test-b' },
  { loanId: '*', branchId: 'branch-002', institutionCode: 'test-a' },
] };
test('staff is opt-in; production cookies are secure; HTTP cookies require development', () => {
  assert.equal(loadConfig({}).staffEnabled, false); assert.equal(cookieOptions({}).secure, true);
  assert.throws(() => loadConfig({ STAFF_COOKIE_SECURE: 'false' }), /development/);
});
test('passwords are salted scrypt hashes and reject bad credentials/placeholders', async () => {
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second); assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong', first), false); assert.equal(await verifyPassword('wrong', null), false);
  await assert.rejects(() => hashPassword('REPLACE_WITH_PASSWORD'), /non-placeholder/);
});
test('directory validation rejects fake production placeholders, duplicate mappings and unknown catalogue IDs', () => {
  validateDirectory(directory); validateDirectory({ institutions: [], rules: [] });
  assert.throws(() => validateDirectory({ ...directory, rules: [...directory.rules, directory.rules[0]] }), /duplicate/);
  assert.throws(() => validateDirectory({ ...directory, rules: [{ ...directory.rules[0], loanId: 'missing' }] }), /unknown/);
  assert.throws(() => validateDirectory({ institutions: [{ ...directory.institutions[0], notificationEmail: 'team@example.invalid' }], rules: [] }), /placeholders/);
});
const integration = process.env.TEST_MONGO_URI ? test : test.skip;
let server, base, a, b, admin, officerA, officerB;
function headers(session, csrf = true) { return { 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, ...(csrf ? { 'X-CSRF-Token': session.csrfToken } : {}) } : {}) }; }
async function request(path, { session, method = 'GET', body, csrf = true, extra = {} } = {}) {
  const res = await fetch(base + '/api/v1/staff/' + path, { method, headers: { ...headers(session, csrf), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, data: res.status === 204 ? null : await res.json(), cookie: res.headers.get('set-cookie') };
}
async function login(email) {
  const res = await request('login', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200); return { ...res.data, cookie: res.cookie.split(';')[0], rawCookie: res.cookie };
}
async function submit(patch = {}) {
  const res = await fetch(base + '/api/v1/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ name: 'Synthetic Person', age: 30, nic: '199012345678', sex: 'female', telephone: '0771234567', address: 'Synthetic address',
      loanId: 'loan-01', branchId: 'branch-001', consent: true, ...patch }) });
  assert.equal(res.status, 201); return (await res.json()).inquiry.reference;
}
before(async () => {
  if (!process.env.TEST_MONGO_URI) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `eoapp_staff_test_${process.pid}_${Date.now()}`, serverSelectionTimeoutMS: 5000 });
  await Promise.all([Inquiry, Institution, Rule, Staff, Session].map(x => x.init()));
  await importDirectory(directory); a = await Institution.findOne({ code: 'test-a' }); b = await Institution.findOne({ code: 'test-b' });
  await provisionStaff({ email: 'admin@local.test', name: 'Test Admin', role: 'admin', password });
  await provisionStaff({ email: 'a@local.test', name: 'Test Officer A', role: 'officer', institutionCode: 'test-a', password });
  await provisionStaff({ email: 'b@local.test', name: 'Test Officer B', role: 'officer', institutionCode: 'test-b', password });
  server = createApp(config).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin@local.test'); officerA = await login('a@local.test'); officerB = await login('b@local.test');
});
after(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();
});
integration('sessions use HttpOnly Strict cookies, hashed tokens and generic credential errors', async () => {
  assert.match(admin.rawCookie, /HttpOnly/); assert.match(admin.rawCookie, /SameSite=Strict/);
  const token = admin.cookie.split('=')[1]; const session = await Session.findOne({ tokenHash: digest(token) });
  assert.ok(session); assert.ok(!JSON.stringify(session).includes(token));
  assert.equal((await request('session', { session: admin })).data.staff.role, 'admin');
  for (const email of ['unknown@local.test', 'admin@local.test']) {
    const result = await request('login', { method: 'POST', body: { email, password: 'wrong' } });
    assert.equal(result.status, 401); assert.equal(result.data.error.message, 'Email or password is incorrect');
  }
  assert.equal((await request('inquiries')).status, 401);
});
integration('routing selects exact pair before branch before loan and defaults to unassigned', async () => {
  for (const [patch, expected] of [[{}, a._id], [{ branchId: 'branch-002' }, a._id], [{ branchId: 'branch-003' }, b._id], [{ loanId: 'loan-02', branchId: 'branch-003' }, null]]) {
    const id = await submit(patch); const doc = await Inquiry.findById(id);
    assert.equal(doc.institutionId?.toString() || null, expected?.toString() || null);
    if (expected) assert.equal(doc.notification.recipient, String(expected) === String(a._id) ? 'team-a@local.test' : 'team-b@local.test');
  }
});
integration('officers cannot list/read/update another institution; public input cannot assign itself', async () => {
  const id = await submit({ institutionId: String(b._id), workflowStatus: 'closed' });
  const detail = await request('inquiries/' + id, { session: officerA });
  assert.equal(detail.status, 200); assert.equal(detail.data.inquiry.status, 'new');
  for (const hidden of ['nic', 'NIC', 'address', 'Address', 'passwordHash', 'payloadHash']) assert.equal(detail.data.inquiry[hidden], undefined);
  assert.equal((await request('inquiries/' + id, { session: officerB })).status, 404);
  assert.equal((await request('inquiries/' + id, { session: officerB, method: 'PATCH', body: { version: 0, status: 'assigned' } })).status, 404);
  const list = await request('inquiries', { session: officerB });
  assert.ok(list.data.inquiries.every(x => x.institutionId === String(b._id)));
  assert.equal((await request('inquiries?institutionId=' + a._id, { session: officerB })).status, 403);
});
integration('updates need CSRF and valid transitions; optimistic version detects concurrent edits', async () => {
  const id = await submit();
  assert.equal((await request('inquiries/' + id, { session: officerA, method: 'PATCH', csrf: false, body: { version: 0, status: 'assigned' } })).status, 403);
  assert.equal((await request('inquiries/' + id, { session: officerA, method: 'PATCH', body: { version: 0, status: 'contacted' } })).status, 422);
  const results = await Promise.all([1, 2].map(() => request('inquiries/' + id, { session: officerA, method: 'PATCH', body: { version: 0, status: 'assigned' } })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  const saved = results.find(x => x.status === 200).data.inquiry;
  assert.equal(saved.version, 1); assert.equal(saved.history.length, 1); assert.equal(saved.history[0].actorName, 'Test Officer A');
  assert.equal((await request('inquiries/' + id, { session: officerA, method: 'PATCH', body: { version: 1, status: 'contacted' }, extra: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await request('inquiries/' + id, { session: officerA, method: 'PATCH', body: { version: 1, institutionId: String(b._id) } })).status, 403);
});
integration('admin assigns unassigned cases and reassignment immediately changes institution access', async () => {
  const id = await submit({ loanId: 'loan-02', branchId: 'branch-003' });
  const assigned = await request('inquiries/' + id, { session: admin, method: 'PATCH', body: { version: 0, institutionId: String(a._id) } });
  assert.equal(assigned.status, 200); assert.equal(assigned.data.inquiry.status, 'new');
  assert.equal((await request('inquiries/' + id, { session: officerA })).status, 200);
  const changed = await request('inquiries/' + id, { session: admin, method: 'PATCH', body: { version: 1, institutionId: String(b._id) } });
  assert.equal(changed.status, 200); assert.equal((await Inquiry.findById(id)).notification.recipient, 'team-b@local.test');
  assert.equal((await request('inquiries/' + id, { session: officerA })).status, 404);
  assert.equal((await request('inquiries/' + id, { session: officerB })).status, 200);
});
integration('reassignment is blocked during delivery; server-controlled recipient is used by worker', async () => {
  await Inquiry.updateMany({}, { $set: { 'notification.status': 'disabled' } });
  const id = await submit();
  await Inquiry.updateOne({ _id: id }, { $set: { 'notification.status': 'processing', 'notification.leaseUntil': new Date(Date.now() + 60000) } });
  assert.equal((await request('inquiries/' + id, { session: admin, method: 'PATCH', body: { version: 0, institutionId: String(b._id) } })).status, 409);
  await Inquiry.updateOne({ _id: id }, { $set: { 'notification.status': 'pending', 'notification.nextAttemptAt': new Date(0) } });
  let recipient;
  const worker = createNotificationWorker(Inquiry, { ...config, smtpEnabled: true, mailTo: 'fallback@local.test' }, { async sendMail(mail) { recipient = mail.to; } });
  await worker.tick(); assert.equal(recipient, 'team-a@local.test');
});
integration('pagination is bounded and scoped; legacy records appear new/unassigned to administrators', async () => {
  await Inquiry.collection.insertOne({ Name: 'Legacy record', NIC: '199012345678', Address: 'private', askLoan: 'Legacy' });
  const legacy = await request('inquiries?status=new&institutionId=unassigned', { session: admin });
  assert.ok(legacy.data.inquiries.some(x => x.name === 'Legacy record' && x.status === 'new'));
  const first = await request('inquiries?limit=1', { session: admin });
  assert.equal(first.data.inquiries.length, 1); assert.ok(first.data.nextCursor);
  const next = await request('inquiries?limit=1&before=' + first.data.nextCursor, { session: admin });
  assert.notEqual(first.data.inquiries[0].reference, next.data.inquiries[0].reference);
  assert.equal((await request('inquiries?limit=1000', { session: admin })).status, 400);
});
integration('persistent login lockout and password reprovisioning protect existing accounts', async () => {
  await Staff.updateOne({ email: 'a@local.test' }, { $set: { lockedUntil: new Date(Date.now() + 60000), failedLogins: 10 } });
  assert.equal((await request('login', { method: 'POST', body: { email: 'a@local.test', password } })).status, 401);
  await Staff.updateOne({ email: 'a@local.test' }, { $unset: { lockedUntil: 1 }, $set: { failedLogins: 0 } });
  await provisionStaff({ email: 'b@local.test', name: 'Test Officer B', role: 'officer', institutionCode: 'test-b', password });
  assert.equal((await request('session', { session: officerB })).status, 401);
  officerB = await login('b@local.test');
});
integration('logout, expiry and account disable revoke access; disabled institutions deny existing sessions', async () => {
  await Session.updateOne({ tokenHash: digest(officerB.cookie.split('=')[1]) }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request('session', { session: officerB })).status, 401);
  officerB = await login('b@local.test');
  const logout = await request('logout', { session: officerB, method: 'POST', body: {} }); assert.equal(logout.status, 204);
  assert.equal((await request('session', { session: officerB })).status, 401);
  await Institution.updateOne({ _id: a._id }, { $set: { active: false } });
  assert.equal((await request('session', { session: officerA })).status, 401);
  const rerouted = await Inquiry.findById(await submit()); assert.equal(String(rerouted.institutionId), String(b._id));
  await disableStaff('admin@local.test'); assert.equal((await request('session', { session: admin })).status, 401);
});
