const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { SMTPServer } = require('smtp-server');
const { createApp } = require('../app');
const { createNotificationWorker } = require('../services/notifications');
const Model = require('../Models/inquiryModel');

const integration = process.env.TEST_MONGO_URI ? test : test.skip;
integration('HTTP receipt → database → authenticated TLS SMTP delivers once; replay does not email again', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eoapp-smtp-'));
  let mailServer, apiServer;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    const cert = readFileSync(join(directory, 'cert.pem'));
    const password = randomUUID(); // Ephemeral test-only authentication, never a provider credential.
    const messages = [];
    mailServer = new SMTPServer({ secure: true, key: readFileSync(join(directory, 'key.pem')), cert,
      logger: false,
      onAuth(auth, session, done) {
        if (auth.username !== 'local-test' || auth.password !== password) return done(new Error('Test authentication failed'));
        done(null, { user: 'local-test' });
      },
      onData(stream, session, done) {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => { messages.push(Buffer.concat(chunks).toString('utf8')); done(); });
        stream.on('error', done);
      },
    });
    await new Promise((resolve, reject) => { mailServer.once('error', reject); mailServer.listen(0, '127.0.0.1', resolve); });
    const config = { origins: ['https://frontend.example.test'], smtpEnabled: true,
      smtp: { host: '127.0.0.1', port: mailServer.server.address().port, secure: true,
        auth: { user: 'local-test', pass: password }, tls: { ca: cert, servername: 'localhost' },
        connectionTimeout: 5000, socketTimeout: 5000 },
      mailFrom: 'inquiries@example.test', mailTo: 'team@example.test' };
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `eoapp_smtp_test_${process.pid}_${Date.now()}`, serverSelectionTimeoutMS: 5000 });
    await Model.init();
    apiServer = createApp(config).listen(0, '127.0.0.1');
    await new Promise(resolve => apiServer.once('listening', resolve));
    const submit = () => fetch(`http://127.0.0.1:${apiServer.address().port}/api/v1/inquiries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'smtp-e2e-test-submission-01' },
      body: JSON.stringify({ name: 'Test Person', age: 30, nic: '199012345678', sex: 'female', telephone: '0771234567',
        address: 'Synthetic address', email: '', message: 'Local SMTP test', loanId: 'general', branchId: 'branch-001', consent: true }),
    });
    const response = await submit(); assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal(messages.length, 0, 'HTTP receipt must not depend on sending mail');
    const worker = createNotificationWorker(Model, config);
    await worker.tick();
    const doc = await Model.findById(receipt.inquiry.reference);
    assert.equal(doc.notification.status, 'sent');
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes(receipt.inquiry.reference));
    assert.match(messages[0], /Loan: General/);
    assert.ok(!messages[0].includes('199012345678'));
    const replay = await submit(); assert.equal(replay.status, 200);
    assert.equal((await replay.json()).inquiry.reference, receipt.inquiry.reference);
    await worker.tick(); assert.equal(messages.length, 1);
  } finally {
    if (apiServer) await new Promise(resolve => apiServer.close(resolve));
    if (mailServer) await new Promise(resolve => mailServer.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});
