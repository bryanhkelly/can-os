// Verify that the generated wire document, browser projection and client types
// are stable across a second generation from the executable application.
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const files = ['openapi.json', 'browser-openapi.json', 'schema.ts'];
function snapshot() {
  return Object.fromEntries(files.map(name => [name,
    createHash('sha256').update(readFileSync(resolve(root, 'sdk/generated', name))).digest('hex')]));
}
const before = snapshot();
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(command, ['run', 'sdk:generate'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (run.error || run.status !== 0) throw new Error('SDK regeneration failed');
const after = snapshot();
for (const name of files) {
  if (before[name] !== after[name]) throw new Error('Non-deterministic SDK artifact: ' + name);
}
console.log(JSON.stringify({ artifacts: after }, null, 2));
