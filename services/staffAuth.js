const { randomBytes, scrypt: rawScrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const Staff = require('../Models/staffModel');
const Session = require('../Models/staffSessionModel');
const Institution = require('../Models/institutionModel');
const scrypt = promisify(rawScrypt);
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const cookieName = 'eoapp_staff';
const digest = text => createHash('sha256').update(text).digest('hex');
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || /REPLACE_WITH/i.test(password)) {
    throw new Error('Use a non-placeholder password of 12–128 characters');
  }
  const salt = randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64, parameters);
  return `scrypt:${salt}:${result.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split(':') : [];
  const valid = parts.length === 3 && parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const result = await scrypt(password, valid ? parts[1] : '0'.repeat(32), 64, parameters);
  return timingSafeEqual(result, Buffer.from(valid ? parts[2] : '0'.repeat(128), 'hex')) && valid;
}
function sessionToken(req) {
  const pairs = (req.headers.cookie || '').split(';').map(x => x.trim());
  const token = pairs.find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function cookieOptions(config) {
  return { httpOnly: true, secure: config.staffCookieSecure !== false, sameSite: 'strict', path: '/api/v1/staff' };
}
function staffView(staff) {
  return { id: String(staff._id), name: staff.name, role: staff.role,
    institutionId: staff.institutionId ? String(staff.institutionId) : null };
}
async function authenticate(req, res, next) {
  const token = sessionToken(req);
  const session = token && await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
  const staff = session && await Staff.findOne({ _id: session.staffId, active: true });
  if (!staff || (session.authVersion || 0) !== (staff.authVersion || 0) ||
      (staff.role === 'officer' && (!staff.institutionId || !await Institution.exists({ _id: staff.institutionId, active: true })))) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
  }
  req.staff = staff; req.staffSession = session; req.csrfToken = digest('csrf:' + token);
  next();
}
function verifyCsrf(req, res, next) {
  const value = req.get('X-CSRF-Token') || '';
  if (!/^[a-f0-9]{64}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(req.csrfToken))) {
    return res.status(403).json({ error: { code: 'CSRF_REQUIRED', message: 'Refresh your staff session and try again' } });
  }
  next();
}
module.exports = { hashPassword, verifyPassword, digest, sessionToken, cookieName, cookieOptions, staffView, authenticate, verifyCsrf };
