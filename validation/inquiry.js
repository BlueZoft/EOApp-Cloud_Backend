const catalogue = require('../data/catalogue.json');
function validateInquiry(body, legacy = false) {
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const aliases = { nic: 'NIC', telephone: 'tel', address: 'addr', message: 'inquiry' };
  const limits = { name: [4, 60], nic: [1, 12], sex: [1, 6], telephone: [1, 10], address: [1, 120], email: [0, 254], message: [0, 500] };
  const value = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const raw = body[key] ?? (legacy ? body[aliases[key]] : undefined) ?? '';
    value[key] = typeof raw === 'string' ? raw.trim() : '';
    if (typeof raw !== 'string' || value[key].length < min || value[key].length > max) fields[key] = 'Invalid length or type';
  }
  if (!legacy && body.consent !== true) fields.consent = 'Consent is required';
  value.consent = body.consent === true;
  const age = body.age;
  value.age = typeof age === 'number' ? age : typeof age === 'string' && /^\d+$/.test(age.trim()) ? Number(age) : NaN;
  if (!Number.isInteger(value.age) || value.age < 18 || value.age > 99) fields.age = 'Must be an integer from 18 to 99';
  if (!/^(?:[0-9]{9}[xXvV]|[0-9]{12})$/.test(value.nic)) fields.nic = 'Invalid NIC';
  value.nic = value.nic.toUpperCase();
  if (!['male', 'female'].includes(value.sex)) fields.sex = 'Select a gender';
  if (!/^0[0-9]{9}$/.test(value.telephone)) fields.telephone = 'Invalid telephone';
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) fields.email = 'Invalid email';
  value.email = value.email.toLowerCase();
  const loan = catalogue.loans.find(x => x.id === body.loanId || (legacy && x.lName === body.askLoan));
  const general = body.loanId === 'general' || (legacy && body.askLoan === 'General');
  const branch = catalogue.branches.find(x => x.id === body.branchId || (legacy && x.name === body.branch));
  if (!loan && !general) fields.loanId = 'Unknown loan';
  if (!branch) fields.branchId = 'Unknown branch';
  Object.assign(value, { loanId: general ? 'general' : loan?.id, askLoan: general ? 'General' : loan?.lName,
    branchId: branch?.id, branch: branch?.name, catalogueVersion: catalogue.version });
  if (Object.keys(fields).length) throw Object.assign(new Error('Please correct the highlighted fields'), { status: 422, code: 'VALIDATION_ERROR', fields });
  return value;
}
module.exports = { validateInquiry };
