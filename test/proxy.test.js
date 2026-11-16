const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { loadConfig } = require('../config');
async function observedClient(config) {
  let address;
  const app = createApp(config, { ready: () => true, limiter: (req, res, next) => { address = req.ip; next(); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/inquiries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' }, body: '{}',
    });
    assert.equal(response.status, 422); // No database access or inquiry is created.
    return address;
  } finally { await new Promise(resolve => server.close(resolve)); }
}
test('direct API ignores untrusted forwarded client headers by default', async () => {
  assert.equal(await observedClient(loadConfig({})), '127.0.0.1');
});
test('explicit single-hop mode reads the client address supplied by the private edge', async () => {
  assert.equal(await observedClient(loadConfig({ TRUST_PROXY_HOPS: '1' })), '203.0.113.10');
});
test('proxy hop configuration accepts only bounded whole numbers', () => {
  for (const value of ['-1', '3', '1.5', 'true', 'garbage']) assert.throws(() => loadConfig({ TRUST_PROXY_HOPS: value }), /TRUST_PROXY_HOPS/);
  assert.equal(loadConfig({}).trustProxyHops, 0);
});
