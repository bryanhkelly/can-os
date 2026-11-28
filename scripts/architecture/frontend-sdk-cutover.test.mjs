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

const domainCutovers = [
  ['src/components/launch-studio/EstablishSiteInformationV61.tsx','saveSiteInformation(siteId, data)','saveSiteInformationV61({'],
  ['src/components/launch-studio/EstablishProgramsAudiencesV61.tsx','readProgramReferences(siteId, controller.signal)','exploreBlueprintReferenceCatalog('],
  ['src/components/launch-studio/EstablishProgramsAudiencesV61.tsx','saveSiteProgramsAudiences(siteId,','saveSiteProgramsAudiencesV61('],
  ['src/components/launch-studio/PrepareOperationsV61.tsx','readSiteInformation(siteId, controller.signal)','readSiteInformationV61('],
  ['src/components/launch-studio/PrepareOperationsV61.tsx','saveSiteInformation(siteId,','saveSiteInformationV61('],
  ['src/components/learning/NativeClassLessonContentPanel.tsx','completeLearnerLesson(classEnrollmentId,selected.lessonId)','markNativeClassLessonComplete('],
  ['src/components/learning/NativeClassHomeworkPanel.tsx','submitLearnerAssignment(classEnrollmentId,assignmentId,responseText)','submitNativeClassHomework('],
];
test('Launch Studio and learner commands use their generated adapters', async () => {
  for (const [path,current,retired] of domainCutovers) {
    const source = await read(path);
    assert.ok(source.includes(current), path + ': ' + current);
    assert.ok(!source.includes(retired), path + ': legacy call ' + retired);
  }
  const site = await read('src/lib/api/browser-site-planning.ts');
  const learning = await read('src/lib/api/browser-learning.ts');
  assert.doesNotMatch(site+learning,/\bfetch\s*\(|\.functions["']/);
  for (const path of ['/api/v1/sites/{siteId}/information','/api/v1/sites/{siteId}/programs-audiences','/api/v1/sites/{siteId}/program-references'])
    assert.ok(site.includes(path), path);
  for (const path of ['/api/v1/me/class-enrollments/{classEnrollmentId}/lessons/{lessonId}/completion','/api/v1/me/class-enrollments/{classEnrollmentId}/assignments/{assignmentId}/submission'])
    assert.ok(learning.includes(path), path);
});
test('planning revision checks, cancellation and learner receipts remain explicit', async () => {
  const info = await read('src/components/launch-studio/EstablishSiteInformationV61.tsx');
  const audiences = await read('src/components/launch-studio/EstablishProgramsAudiencesV61.tsx');
  const prepare = await read('src/components/launch-studio/PrepareOperationsV61.tsx');
  for (const source of [info,audiences,prepare]) {
    assert.match(source,/expectedRevision/);
    assert.match(source,/result\.siteId !== siteId/);
    assert.match(source,/!result\.revision/);
  }
  assert.match(audiences,/controller\.abort\(\)/);
  assert.match(prepare,/controller\.abort\(\)/);
  const learning = await read('src/lib/api/browser-learning.ts');
  assert.match(learning,/receipt\.recorded !== true/);
  assert.match(learning,/typeof receipt\.alreadySubmitted !== "boolean"/);
});
