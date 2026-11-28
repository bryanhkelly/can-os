import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerReadFetch } from './server-read-transport.mjs';
const origin = 'https://app.example.test';
const a = 'a'.repeat(43), b = 'b'.repeat(43);
const incoming = (cookie = '') => new Request(origin + '/home', { headers: {
  cookie, authorization: 'Bearer never-forward', 'x-forwarded-host': 'evil.example',
} });

test('server read forwards only exact incoming session cookies and never replays', async () => {
  let calls = 0;
  const read = createServerReadFetch(origin, incoming('theme=dark; __Host-can_os_session=' + a + '; __Host-can_os_v3_session=' + b), async request => {
    calls++;
    assert.equal(request.headers.get('cookie'), '__Host-can_os_session=' + a + '; __Host-can_os_v3_session=' + b);
    assert.equal(request.headers.get('authorization'), null);
    assert.equal(request.headers.get('x-forwarded-host'), null);
    assert.equal(request.headers.get('accept'), 'application/json');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    return new Response(null, { status: 503 });
  });
  const result = await read(new Request(origin + '/api/v1/me', { headers: { cookie: 'injected=secret', authorization: 'Bearer injected' } }));
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

test('rejects mutation, untrusted destination, redirect path escape and ambiguous cookies', async () => {
  const read = createServerReadFetch(origin, incoming(), async () => { throw Error('must not fetch'); });
  for (const request of [
    new Request(origin + '/api/v1/me', { method: 'POST' }),
    new Request('https://other.example/api/v1/me'),
    new Request(origin + '/api/v1/../private'),
    new Request(origin + '/api/v10/me'),
  ]) await assert.rejects(() => read(request), /outside server read boundary/);
  assert.throws(() => createServerReadFetch(origin, new Request('https://other.example/home')), /trusted HTTPS/);
  assert.throws(() => createServerReadFetch('http://app.example.test', incoming()), /trusted HTTPS/);
  assert.throws(() => createServerReadFetch(origin, incoming('__Host-can_os_session=' + a + '; __Host-can_os_session=' + b)), /Invalid session cookie/);
  assert.throws(() => createServerReadFetch(origin, incoming('__Host-can_os_session=malformed')), /Invalid session cookie/);
});

test('server transport never shares credentials between incoming requests', async () => {
  const seen = [];
  const capture = async request => { seen.push(request.headers.get('cookie')); return new Response(null, { status: 200 }); };
  const one = createServerReadFetch(origin, incoming('__Host-can_os_session=' + a), capture);
  const two = createServerReadFetch(origin, incoming('__Host-can_os_session=' + b), capture);
  const anonymous = createServerReadFetch(origin, incoming(), capture);
  await Promise.all([one(new Request(origin + '/api/v1/me')), two(new Request(origin + '/api/v1/me')), anonymous(new Request(origin + '/api/v1/me'))]);
  assert.deepEqual(seen, ['__Host-can_os_session=' + a, '__Host-can_os_session=' + b, null]);
});
