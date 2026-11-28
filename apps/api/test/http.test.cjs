const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi, readConfig } = require('../dist/bootstrap');
const { DefaultDenyGuard, PublicOperation } = require('../dist/security');
const { Reflector } = require('@nestjs/core');

async function withServer(docs, run) {
  const config = readConfig({ API_DOCS: docs });
  const { app, document } = await createApi(config);
  try {
    await app.listen(0, '127.0.0.1');
    await run(await app.getUrl(), document);
  } finally { await app.close(); }
}
test('independent HTTP liveness, correlation and documented operation', async () => {
  await withServer('0', async (url, document) => {
    const response = await fetch(url + '/api/v1/health/live', { headers: { 'x-request-id': 'untrusted' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.match(response.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(document.paths['/api/v1/health/live'].get.operationId, 'getLiveness');
    const missing = await fetch(url + '/api/v1/not-a-route');
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /application\/problem\+json/);
    assert.equal((await missing.json()).requestId, missing.headers.get('x-request-id'));
    assert.equal((await fetch(url + '/api/openapi.json')).status, 404);
    assert.equal((await fetch(url + '/api/docs')).status, 404);
  });
});
test('local Swagger UI and JSON reflect the real HTTP contract', async () => {
  await withServer('1', async (url, document) => {
    const response = await fetch(url + '/api/openapi.json');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).paths, document.paths);
    const ui = await fetch(url + '/api/docs');
    assert.equal(ui.status, 200);
    assert.match(await ui.text(), /swagger-ui/i);
  });
});
test('Swagger cannot be enabled on a production or network-facing listener', () => {
  assert.throws(() => readConfig({ API_DOCS: '1', NODE_ENV: 'production' }));
  assert.throws(() => readConfig({ API_DOCS: '1', API_HOST: '0.0.0.0' }));
});
test('unmarked operations fail closed', () => {
  const guard = new DefaultDenyGuard(new Reflector());
  const handler = () => {};
  class Controller {}
  const context = { getHandler: () => handler, getClass: () => Controller };
  assert.throws(() => guard.canActivate(context), /Unauthorized/);
  PublicOperation()(Controller.prototype, 'method', { value: handler });
  assert.equal(guard.canActivate(context), true);
});

test('canonical reads deny anonymous callers and do not trust forged identity headers', async () => {
  await withServer('0', async (url, document) => {
    for (const route of ['/api/v1/me','/api/v1/me/student/classes']) {
      const response = await fetch(url + route, {headers:{'x-person-id':'forged','x-role':'platform_owner'}});
      assert.equal(response.status,401);
      assert.equal((await response.json()).code,'AUTHENTICATION_REQUIRED');
    }
    assert.ok(document.paths['/api/v1/me'].get.security);
    assert.ok(document.paths['/api/v1/me/student/classes'].get.security);
  });
});
