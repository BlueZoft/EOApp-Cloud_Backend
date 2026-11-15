require('dotenv').config({ quiet: true });
const { readFile } = require('node:fs/promises');
const mongoose = require('mongoose');
const connectDB = require('../Config/db');
const { importDirectory, provisionStaff, disableStaff } = require('../services/provisioning');
const Rule = require('../Models/routingRuleModel');
const Institution = require('../Models/institutionModel');
const Staff = require('../Models/staffModel');
async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) { value += chunk; if (value.length > 512) throw new Error('Password input too long'); }
    return value.replace(/\r?\n$/, '');
  }
  process.stderr.write('Password (hidden): ');
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { process.stdin.off('data', handle); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n'); };
    function handle(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled')); return; }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (value.length < 129) value += char;
      }
    }
    process.stdin.on('data', handle);
  });
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const allowed = new Set(['--file', '--email', '--name', '--role', '--institution', '--loan', '--branch']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid command options');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!['import-directory', 'provision', 'disable', 'remove-rule', 'list'].includes(command)) throw new Error('Commands: import-directory, provision, disable, remove-rule, list. See docs/STAFF.md.');
  const password = command === 'provision' ? await readPassword() : null;
  await connectDB(process.env.MONGO_URI);
  if (command === 'import-directory') console.log(await importDirectory(JSON.parse(await readFile(options.file, 'utf8'))));
  if (command === 'provision') {
    await provisionStaff({ email: options.email, name: options.name, role: options.role, institutionCode: options.institution, password });
    console.log('Account provisioned; prior sessions revoked');
  }
  if (command === 'disable') { await disableStaff(options.email); console.log('Account disabled; sessions revoked'); }
  if (command === 'remove-rule') {
    if (!options.loan || !options.branch) throw new Error('Supply --loan and --branch (use * explicitly for wildcard)');
    const result = await Rule.deleteOne({ loanId: options.loan, branchId: options.branch }); console.log('Rules removed:', result.deletedCount);
  }
  if (command === 'list') {
    console.log('Institutions:', (await Institution.find().select('code name active').lean()));
    console.log('Staff:', (await Staff.find().select('email name role institutionId active').lean()));
  }
}
main().catch(error => { console.error(error instanceof mongoose.Error || error.name?.startsWith('Mongo') ? 'Database operation failed' : error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
