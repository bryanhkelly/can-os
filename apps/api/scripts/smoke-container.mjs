// No credentials, no DB writes, no production deployment.
// Run after building the locked image: node apps/api/scripts/smoke-container.mjs becomuna-api:ws01
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const image = process.argv[2];
if (!image) throw new Error('Supply the locally built image tag');
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Docker command failed: ' + args[0]);
  return result.stdout.trim();
}
const id = docker(['run', '--detach', '--read-only', '--tmpfs', '/tmp', '--cap-drop=ALL',
  '--security-opt', 'no-new-privileges', '--publish', '127.0.0.1::3001', image]);
try {
  const endpoint = 'http://' + docker(['port', id, '3001/tcp']);
  let live;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      live = await fetch(endpoint + '/api/v1/health/live', { signal: AbortSignal.timeout(1500) });
      if (live.ok) break;
    } catch { /* retry startup only, never replay business operations */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(live?.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.match(live.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  assert.equal((await fetch(endpoint + '/api/openapi.json')).status, 404);
  assert.equal((await fetch(endpoint + '/api/docs')).status, 404);
  assert.equal((await fetch(endpoint + '/api/v1/me')).status, 401);
  assert.equal((await fetch(endpoint + '/api/v1/access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: endpoint }, body: '{}',
  })).status, 503);
  assert.notEqual(docker(['exec', id, 'id', '-u']), '0');
  console.log('Transport-only container smoke passed; business readiness NOT established.');
} finally { docker(['rm', '-f', id]); }
