const express = require('express');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const Staff = require('../Models/staffModel');
const Session = require('../Models/staffSessionModel');
const Institution = require('../Models/institutionModel');
const Inquiry = require('../Models/inquiryModel');
const { rateLimit } = require('../Middleware/rateLimit');
const { verifyPassword, digest, sessionToken, cookieName, cookieOptions, staffView, authenticate, verifyCsrf } = require('../services/staffAuth');
const states = ['new', 'assigned', 'contacted', 'closed'];
const transitions = { new: ['assigned', 'closed'], assigned: ['contacted', 'closed', 'new'], contacted: ['closed', 'assigned'], closed: ['assigned'] };
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const idValid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
function scope(staff) { return staff.role === 'admin' ? {} : { institutionId: staff.institutionId }; }
function view(doc, detail = false) {
  return { reference: String(doc._id), name: doc.name, loan: doc.askLoan, branch: doc.branch,
    institutionId: doc.institutionId ? String(doc.institutionId) : null,
    status: doc.workflowStatus || 'new', version: doc.workflowVersion || 0, createdAt: doc.createdAt,
    ...(detail ? { telephone: doc.telephone, email: doc.email || '', message: doc.message || '',
      assignedOfficerId: doc.assignedOfficerId ? String(doc.assignedOfficerId) : null,
      history: (doc.history || []).map(event => ({ at: event.at, actorName: event.actorName, action: event.action, status: event.status })) } : {}) };
}
function createStaffRouter(config, ready) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!config.staffEnabled) throw fail(503, 'STAFF_DISABLED', 'Staff access is not enabled');
    if (!ready()) throw fail(503, 'NOT_READY', 'Service unavailable');
    if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) throw fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
    next();
  });
  router.post('/login', rateLimit({ limit: 10, windowMs: 15 * 60000 }), async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128 || !password) {
      throw fail(400, 'INVALID_LOGIN', 'Supply an email and password');
    }
    const staff = await Staff.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    const now = new Date();
    if (staff?.lockedUntil && staff.lockedUntil <= now) {
      await Staff.updateOne({ _id: staff._id, lockedUntil: { $lte: now } }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });
    }
    const passwordValid = await verifyPassword(password, staff?.passwordHash);
    const locked = staff?.lockedUntil && staff.lockedUntil > now;
    const institutionValid = staff?.role !== 'officer' || (staff.institutionId && await Institution.exists({ _id: staff.institutionId, active: true }));
    if (!staff || !staff.active || !passwordValid || locked || !institutionValid) {
      if (staff && !locked) {
        const changed = await Staff.findByIdAndUpdate(staff._id, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' });
        if (changed.failedLogins >= 10) await Staff.updateOne({ _id: staff._id }, { $set: { lockedUntil: new Date(Date.now() + 15 * 60000) } });
      }
      throw fail(401, 'INVALID_LOGIN', 'Email or password is incorrect');
    }
    await Staff.updateOne({ _id: staff._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });
    const old = sessionToken(req);
    if (old) await Session.deleteOne({ tokenHash: digest(old) });
    const token = randomBytes(32).toString('base64url');
    await Session.create({ tokenHash: digest(token), staffId: staff._id, expiresAt: new Date(Date.now() + 8 * 3600000) });
    res.cookie(cookieName, token, { ...cookieOptions(config), maxAge: 8 * 3600000 });
    res.json({ staff: staffView(staff), csrfToken: digest('csrf:' + token) });
  });
  router.use(authenticate);
  router.get('/session', (req, res) => res.json({ staff: staffView(req.staff), csrfToken: req.csrfToken }));
  router.post('/logout', verifyCsrf, async (req, res) => {
    await Session.deleteOne({ _id: req.staffSession._id });
    res.clearCookie(cookieName, cookieOptions(config)); res.status(204).end();
  });
  router.get('/institutions', async (req, res) => {
    const filter = req.staff.role === 'admin' ? {} : { _id: req.staff.institutionId };
    const institutions = await Institution.find({ ...filter, active: true }).sort({ name: 1 });
    res.json({ institutions: institutions.map(x => ({ id: String(x._id), name: x.name })) });
  });
  router.get('/inquiries', async (req, res) => {
    const filter = scope(req.staff);
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw fail(400, 'INVALID_FILTER', 'Limit must be 1–50');
    if (req.query.status) {
      if (!states.includes(req.query.status)) throw fail(400, 'INVALID_FILTER', 'Unknown status');
      if (req.query.status === 'new') filter.$or = [{ workflowStatus: 'new' }, { workflowStatus: { $exists: false } }];
      else filter.workflowStatus = req.query.status;
    }
    if (req.query.institutionId) {
      if (req.staff.role !== 'admin') throw fail(403, 'FORBIDDEN', 'Administrators only');
      if (req.query.institutionId === 'unassigned') filter.institutionId = null;
      else if (idValid(req.query.institutionId)) filter.institutionId = new mongoose.Types.ObjectId(req.query.institutionId);
      else throw fail(400, 'INVALID_FILTER', 'Invalid institution');
    }
    if (req.query.before) {
      if (!idValid(req.query.before)) throw fail(400, 'INVALID_FILTER', 'Invalid cursor');
      filter._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
    }
    if (req.query.reference) {
      if (!idValid(req.query.reference)) throw fail(400, 'INVALID_FILTER', 'Invalid reference');
      filter._id = new mongoose.Types.ObjectId(req.query.reference);
    }
    const docs = await Inquiry.find(filter).select('Name askLoan Branch institutionId workflowStatus workflowVersion createdAt').sort({ _id: -1 }).limit(limit + 1);
    const hasMore = docs.length > limit; const page = docs.slice(0, limit);
    res.json({ inquiries: page.map(x => view(x)), nextCursor: hasMore ? String(page.at(-1)._id) : null });
  });
  router.get('/inquiries/:id', async (req, res) => {
    if (!idValid(req.params.id)) throw fail(404, 'NOT_FOUND', 'Inquiry not found');
    const doc = await Inquiry.findOne({ _id: req.params.id, ...scope(req.staff) });
    if (!doc) throw fail(404, 'NOT_FOUND', 'Inquiry not found');
    res.json({ inquiry: view(doc, true) });
  });
  router.patch('/inquiries/:id', rateLimit({ limit: 30 }), verifyCsrf, async (req, res) => {
    if (!idValid(req.params.id)) throw fail(404, 'NOT_FOUND', 'Inquiry not found');
    const body = req.body || {};
    if (Object.keys(body).some(k => !['version', 'status', 'institutionId'].includes(k)) || !Number.isInteger(body.version) || body.version < 0) {
      throw fail(422, 'VALIDATION_ERROR', 'Supply the current version and a status or institution');
    }
    const doc = await Inquiry.findOne({ _id: req.params.id, ...scope(req.staff) });
    if (!doc) throw fail(404, 'NOT_FOUND', 'Inquiry not found');
    if ((doc.workflowVersion || 0) !== body.version) throw fail(409, 'STALE_INQUIRY', 'Inquiry changed; refresh before saving');
    const changes = {};
    const currentStatus = doc.workflowStatus || 'new';
    const routingChanged = Object.hasOwn(body, 'institutionId') && body.institutionId !== (doc.institutionId ? String(doc.institutionId) : null);
    if (Object.hasOwn(body, 'institutionId') && req.staff.role !== 'admin') throw fail(403, 'FORBIDDEN', 'Administrators only');
    if (routingChanged) {
      const institution = idValid(body.institutionId) && await Institution.findOne({ _id: body.institutionId, active: true });
      if (body.institutionId !== null && !institution) {
        throw fail(422, 'VALIDATION_ERROR', 'Select an active institution');
      }
      if (Object.hasOwn(body, 'status')) throw fail(422, 'VALIDATION_ERROR', 'Change institution and status separately');
      if (doc.notification?.status === 'processing') throw fail(409, 'NOTIFICATION_BUSY', 'Notification is in progress; retry later');
      changes['notification.recipient'] = institution ? institution.notificationEmail : null;
      changes.institutionId = body.institutionId; changes.workflowStatus = 'new'; changes.assignedOfficerId = null;
    } else if (body.status !== undefined) {
      if (!states.includes(body.status) || !transitions[currentStatus]?.includes(body.status)) throw fail(422, 'INVALID_TRANSITION', 'Status transition is not allowed');
      if (['assigned', 'contacted'].includes(body.status) && !doc.institutionId) throw fail(422, 'INSTITUTION_REQUIRED', 'Choose an institution first');
      changes.workflowStatus = body.status;
      if (body.status === 'assigned') changes.assignedOfficerId = req.staff._id;
      if (body.status === 'new') changes.assignedOfficerId = null;
    } else throw fail(422, 'VALIDATION_ERROR', 'No change supplied');
    const updated = await Inquiry.findOneAndUpdate({ _id: doc._id, ...scope(req.staff),
      ...(routingChanged ? { 'notification.status': { $ne: 'processing' } } : {}),
      ...(body.version === 0 ? { $or: [{ workflowVersion: 0 }, { workflowVersion: { $exists: false } }] } : { workflowVersion: body.version }) },
    { $set: changes, $inc: { workflowVersion: 1 }, $push: { history: { $each: [{ at: new Date(), actorId: req.staff._id,
      actorName: req.staff.name, action: routingChanged ? 'institution_changed' : 'status_changed',
      status: changes.workflowStatus, institutionId: routingChanged ? changes.institutionId : doc.institutionId }], $slice: -100 } } },
    { returnDocument: 'after' });
    if (!updated) throw fail(409, 'STALE_INQUIRY', 'Inquiry changed; refresh before saving');
    res.json({ inquiry: view(updated, true) });
  });
  return router;
}
module.exports = { createStaffRouter };
