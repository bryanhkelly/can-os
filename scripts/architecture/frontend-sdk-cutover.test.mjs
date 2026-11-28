import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL('../../'+path, import.meta.url), 'utf8');
const cutovers = [
  ['src/routes/access.index.tsx','requestAccessLink','/access/request','/api/v1/access/request'],
  ['src/routes/access.register.tsx','registerAccount','/access/register','/api/v1/access/register'],
  ['src/routes/site.new.tsx','requestSiteSignup','/site/new','/api/v1/access/site-signups'],
];

test('migrated React forms use the generated SDK without legacy fetch fallback', async () => {
  const facade = await read('src/lib/api/browser-access.ts');
  assert.match(facade,/from "\.\.\/\.\.\/\.\.\/apps\/api\/sdk\/client"/);
  assert.doesNotMatch(facade,/\bfetch\s*\(|localStorage|sessionStorage|Authorization/);
  for (const [path,command,legacy,rest] of cutovers) {
    const route = await read(path);
    assert.ok(route.includes(command+'('), path);
    assert.ok(!route.includes('fetch("'+legacy+'"'), path);
    assert.ok(facade.includes('POST("'+rest+'"'), rest);
  }
});

test('registration and Site signup retain their UI validation and acknowledgement gates', async () => {
  const registration = await read('src/routes/access.register.tsx');
  const signup = await read('src/routes/site.new.tsx');
  assert.match(registration,/!adultConfirmed/);
  assert.match(registration,/!result\?\.accepted/);
  assert.match(signup,/publicSignupOrganizationTypeSchema\.safeParse/);
  assert.match(signup,/!result\?\.accepted/);
  assert.match(signup,/result\.demo === true && !result\.privateAccessCode/);
});
