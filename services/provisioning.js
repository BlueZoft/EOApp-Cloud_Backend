const Institution = require('../Models/institutionModel');
const Rule = require('../Models/routingRuleModel');
const Staff = require('../Models/staffModel');
const Session = require('../Models/staffSessionModel');
const { hashPassword } = require('./staffAuth');
const catalogue = require('../data/catalogue.json');
function validateDirectory(input) {
  if (!input || !Array.isArray(input.institutions) || !Array.isArray(input.rules)) throw new Error('Supply institutions and rules arrays');
  const codes = new Set(); const pairs = new Set();
  for (const entry of input.institutions) {
    if (!entry || !/^[a-z][a-z0-9-]{1,63}$/.test(entry.code) || codes.has(entry.code) ||
      typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160 ||
      typeof entry.notificationEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.notificationEmail) ||
      /example\.invalid|REPLACE_WITH/i.test(entry.notificationEmail + entry.name) ||
      (entry.active !== undefined && typeof entry.active !== 'boolean')) throw new Error('Invalid or duplicate institution; replace real-world placeholders');
    codes.add(entry.code);
  }
  for (const rule of input.rules) {
    if (!rule || !codes.has(rule.institutionCode) ||
      !['*', 'general', ...catalogue.loans.map(x => x.id)].includes(rule.loanId) ||
      !['*', ...catalogue.branches.map(x => x.id)].includes(rule.branchId) || pairs.has(`${rule.loanId}:${rule.branchId}`)) {
      throw new Error('Invalid, duplicate or unknown routing mapping');
    }
    pairs.add(`${rule.loanId}:${rule.branchId}`);
  }
  return input;
}
async function importDirectory(input) {
  validateDirectory(input); // Validate the complete file before any write.
  const institutions = new Map();
  for (const entry of input.institutions) {
    const doc = await Institution.findOneAndUpdate({ code: entry.code }, { $set: {
      name: entry.name.trim(), notificationEmail: entry.notificationEmail.trim().toLowerCase(), active: entry.active !== false,
    } }, { upsert: true, returnDocument: 'after', runValidators: true });
    institutions.set(entry.code, doc);
  }
  for (const rule of input.rules) await Rule.updateOne({ loanId: rule.loanId, branchId: rule.branchId },
    { $set: { institutionId: institutions.get(rule.institutionCode)._id } }, { upsert: true, runValidators: true });
  return { institutions: institutions.size, rules: input.rules.length };
}
async function provisionStaff({ email, name, role, institutionCode, password }) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /example\.invalid|REPLACE_WITH/i.test(email) ||
    typeof name !== 'string' || !name.trim() || name.length > 100 || !['admin', 'officer'].includes(role)) throw new Error('Invalid staff details');
  const institution = role === 'officer' && await Institution.findOne({ code: institutionCode, active: true });
  if (role === 'officer' && !institution) throw new Error('An active institution is required for an officer');
  const passwordHash = await hashPassword(password);
  const staff = await Staff.findOneAndUpdate({ email: email.trim().toLowerCase() }, { $set: {
    name: name.trim(), role, institutionId: institution ? institution._id : null, passwordHash, active: true, failedLogins: 0,
  }, $unset: { lockedUntil: 1 } }, { upsert: true, returnDocument: 'after', runValidators: true });
  await Session.deleteMany({ staffId: staff._id });
  return staff;
}
async function disableStaff(email) {
  const staff = await Staff.findOneAndUpdate({ email: email.trim().toLowerCase() }, { $set: { active: false } });
  if (!staff) throw new Error('Staff account not found');
  await Session.deleteMany({ staffId: staff._id });
}
module.exports = { validateDirectory, importDirectory, provisionStaff, disableStaff };
