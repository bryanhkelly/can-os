const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi, readConfig } = require('../dist/bootstrap');
const { fastifyStatus } = require('../dist/problem.filter');

test('transport errors are mapped by recognized code, not arbitrary status or message', () => {
  for (const [code, status] of [
    ['FST_ERR_CTP_INVALID_JSON_BODY', 400], ['FST_ERR_CTP_EMPTY_JSON_BODY', 400],
    ['FST_ERR_CTP_BODY_TOO_LARGE', 413], ['FST_ERR_CTP_INVALID_MEDIA_TYPE', 415],
    ['FST_ERR_REQUEST_TIMEOUT', 408],
  ]) assert.equal(fastifyStatus(Object.assign(new Error('private parser detail'), { code })), status);
  assert.equal(fastifyStatus({ statusCode: 403, code: 'FST_ERR_VALIDATION' }), 500);
  assert.equal(fastifyStatus(Object.assign(new Error('database secret'), { statusCode: 400 })), 500);
});

test('independent HTTP transport faults use safe problem responses and documented headers', async () => {
  const { app, document } = await createApi(readConfig({}));
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const path = '/api/v1/access/request';
    for (const [type, body, status] of [
      ['application/json', '{"private-value":', 400],
      ['application/json', JSON.stringify({ data: 'x'.repeat(1024 * 1024) }), 413],
      ['application/x-unrecognized', 'private-value', 415],
    ]) {
      const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': type, 'x-request-id': 'forged' }, body });
      assert.equal(res.status, status);
      assert.match(res.headers.get('content-type'), /application\/problem\+json/);
      const problem = await res.json();
      assert.equal(problem.status, status);
      assert.equal(problem.requestId, res.headers.get('x-request-id'));
      assert.notEqual(problem.requestId, 'forged');
      assert.equal(JSON.stringify(problem).includes('private-value'), false);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.ok(document.paths[path].post.responses[status].content['application/problem+json']);
      assert.ok(document.paths[path].post.responses[status].headers['X-Request-Id']);
    }
    for (const item of Object.values(document.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (!item[method]) continue;
        assert.ok(item[method].responses['500']);
        for (const response of Object.values(item[method].responses)) {
          if (!response.$ref) assert.ok(response.headers['X-Request-Id']);
        }
      }
    }
  } finally { await app.close(); }
});
