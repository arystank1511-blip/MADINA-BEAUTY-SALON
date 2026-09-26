const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
process.env.APP_ORIGIN = 'https://forma.example';
process.env.VERCEL = '1';
process.env.VERCEL_URL = 'forma-preview.vercel.app';
const { isAllowedOrigin } = require('../apps/api/dist/src/config.js');
const handler = require('../api/index.js');
let server, url;
before(async () => {
  server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      res.statusCode = 500;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    }),
);
test('serverless entry serves Nest routes during concurrent cold start', async () => {
  const replies = await Promise.all(Array.from({ length: 5 }, () => fetch(`${url}/api/v1/health`)));
  for (const reply of replies) assert.equal(reply.status, 200);
  assert.equal((await fetch(`${url}/api/openapi.json`)).status, 200);
});
test('CSRF allows only exact configured and platform origins', async () => {
  assert.equal(isAllowedOrigin('https://forma.example'), true);
  assert.equal(isAllowedOrigin('https://forma-preview.vercel.app'), true);
  for (const value of [
    undefined,
    'https://evil.vercel.app',
    'https://forma-preview.vercel.app.evil.test',
    'http://forma-preview.vercel.app',
  ])
    assert.equal(isAllowedOrigin(value), false);
  const denied = await fetch(`${url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { origin: 'https://evil.vercel.app', 'x-csrf-protection': '1' },
  });
  assert.equal(denied.status, 403);
  const allowed = await fetch(`${url}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      origin: 'https://forma-preview.vercel.app',
      'x-csrf-protection': '1',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(allowed.status, 400);
});
