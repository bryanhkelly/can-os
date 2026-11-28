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
test('unmarked operations fail closed', async () => {
  const guard = new DefaultDenyGuard(new Reflector(), {});
  const handler = () => {};
  class Controller {}
  const context = { getHandler: () => handler, getClass: () => Controller };
  await assert.rejects(() => guard.canActivate(context), /Unauthorized/);
  PublicOperation()(Controller.prototype, 'method', { value: handler });
  assert.equal(await guard.canActivate(context), true);
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

test('canonical reads cannot be enabled outside local development', () => {
  assert.throws(() => readConfig({ API_CANONICAL_READS:'1', NODE_ENV:'production' }));
  assert.throws(() => readConfig({ API_CANONICAL_READS:'1', API_HOST:'0.0.0.0' }));
});

test('learner resource routes require the standard session and publish explicit UUID parameters', async ()=>{
  await withServer('0',async (url,document)=>{
    for(const resource of ['resume','assignments']){
      const path='/api/v1/me/class-enrollments/00000000-0000-4000-8000-000000000001/'+resource;
      const response=await fetch(url+path,{headers:{'x-role':'student','x-person-id':'forged'}});
      assert.equal(response.status,401);
      assert.equal((await response.json()).code,'AUTHENTICATION_REQUIRED');
      const operation=document.paths['/api/v1/me/class-enrollments/{classEnrollmentId}/'+resource].get;
      assert.ok(operation.security);
      assert.ok(operation.parameters.some(p=>p.name==='classEnrollmentId'&&p.in==='path'&&p.required));
      assert.ok(operation.responses['403']);
      assert.equal((await fetch(url+path,{headers:{cookie:'unrelated=value'}})).status,503);
    }
  });
});
test('learner contract rejects invalid parameters and unintended response fields',()=>{
  const {enrollmentId,resumeSchema,homeworkSchema}=require('../dist/learning.contracts');
  assert.throws(()=>enrollmentId({classEnrollmentId:'bad'}));
  assert.throws(()=>enrollmentId({classEnrollmentId:'00000000-0000-4000-8000-000000000001',actor:'forged'}));
  assert.equal(resumeSchema.safeParse({classId:'00000000-0000-4000-8000-000000000001',title:'Class',lesson:null,completed:1,total:1}).success,true);
  assert.equal(homeworkSchema.safeParse({assignments:[{id:'00000000-0000-4000-8000-000000000001',title:'Assignment',dueAt:null,status:'assigned',submittedAt:null,responseText:'private'}]}).success,false);
});

test('write operations are off by default and cannot be enabled in production',async()=>{
  assert.throws(()=>readConfig({API_CANONICAL_WRITES:'1'}));
  assert.throws(()=>readConfig({API_CANONICAL_WRITES:'1',API_CANONICAL_READS:'1',NODE_ENV:'production'}));
  await withServer('0',async(url,document)=>{
    const route='/api/v1/me/session/membership';
    const response=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json',Origin:url},body:'{}'});
    assert.equal(response.status,503);
    assert.equal(document.paths[route].post.operationId,'selectMyMembership');
    assert.ok(document.paths[route].post.security);
  });
});
test('write guard rejects wrong origin and content type before loading database bridge',async()=>{
  const {CanonicalIdentityService}=require('../dist/identity.service');
  const service=new CanonicalIdentityService();
  service.configure(true,'http://localhost:3001');
  const req={method:'POST',headers:{origin:'https://foreign.example','content-type':'application/json',cookie:'unrelated=value'}};
  await assert.rejects(()=>service.authenticate(req,'write'),/Forbidden/);
  await assert.rejects(()=>service.authenticate({...req,headers:{...req.headers,origin:'http://localhost:3001','content-type':'text/plain'}},'write'),/Unsupported Media Type/);
  await assert.rejects(()=>service.authenticate({...req,headers:{origin:'http://localhost:3001','content-type':'application/json'}},'write'),/Unauthorized/);
});

test('local write configuration rejects mismatched or missing QA database configuration',()=>{
  const {assertIsolatedWriteEnvironment}=require('../dist/bootstrap');
  assert.throws(()=>assertIsolatedWriteEnvironment({NODE_ENV:'test',DATABASE_URL:'not-a-qa-database'}));
});

test('Site and Offering operations have explicit protected contracts and disabled writes by default',async()=>{
 await withServer('0',async(url,document)=>{
  const version='00000000-0000-4000-8000-000000000001';
  for(const path of ['/api/v1/sites',...['release-submissions','release-policy','release-decisions','course-publication','asset-manifest-approval','publication'].map(x=>'/api/v1/offering-versions/{offeringVersionId}/'+x)]){
   const operation=document.paths[path].post;
   assert.ok(operation.security);assert.ok(operation.requestBody);assert.ok(operation.responses['403']);
   const response=await fetch(url+path.replace('{offeringVersionId}',version),{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'});
   assert.equal(response.status,503);
  }
 });
});
test('release contracts reject caller identities, stale-hash format and disabled review protections',()=>{
 const c=require('../dist/platform-commands.contracts');
 const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
 assert.equal(c.publishBody.safeParse({manifestId:id,expectedHash:hash}).success,true);
 assert.equal(c.publishBody.safeParse({manifestId:id,expectedHash:hash,actorPersonId:id}).success,false);
 assert.equal(c.publishBody.safeParse({manifestId:id,expectedHash:'bad'}).success,false);
 assert.equal(c.policyBody.safeParse({expectedManuscriptHash:hash,expectedPolicyRevision:hash,reviewEvidenceVersionId:id,rationale:'Evidence reviewed',requirements:[{courseVersionId:id,minimumApprovedPrimaryTracks:0,completeLessonCoverageRequired:false,independentAcademicReviewRequired:false,rightsClearanceRequired:true,accessibilityReviewRequired:true}]}).success,false);
});

test('publisher reads expose protected release and bounded review queue contracts',async()=>{
 await withServer('0',async(url,document)=>{
  const id='00000000-0000-4000-8000-000000000001';
  for(const p of ['/api/v1/offering-versions/{offeringVersionId}/release','/api/v1/offering-versions/{offeringVersionId}/release-policy','/api/v1/offering-versions/release-review-queue']){
    assert.ok(document.paths[p].get.security);
    assert.ok(document.paths[p].get.responses['403']);
    assert.equal((await fetch(url+p.replace('{offeringVersionId}',id))).status,401);
  }
 });
 const {queueQuery}=require('../dist/platform-commands.contracts');
 assert.equal(queueQuery.safeParse({}).success,true);
 assert.equal(queueQuery.safeParse({createdAt:'2026-11-28T00:00:00Z'}).success,false);
 assert.equal(queueQuery.safeParse({createdAt:'2026-11-28T00:00:00Z',id:'00000000-0000-4000-8000-000000000001'}).success,true);
});

test('anonymous access endpoints are not an ungated public bypass',async()=>{
 await withServer('0',async(url,document)=>{
  for(const p of ['request','verify','register','site-signups','logout']){
   const path='/api/v1/access/'+p;
   assert.ok(document.paths[path].post.requestBody);
   assert.ok(document.paths[path].post.responses['429']);
   assert.equal((await fetch(url+path,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
  assert.equal((await fetch(url+'/api/v1/access/session')).status,401);
 });
});

test('access wire contracts forbid ambiguous credentials and caller-selected identities',()=>{
 const c=require('../dist/access.contracts');
 const token='a'.repeat(43),email='qa@example.test';
 assert.equal(c.verificationBody.safeParse({token}).success,true);
 assert.equal(c.verificationBody.safeParse({token,email,code:'000000'}).success,false);
 assert.equal(c.requestBody.safeParse({email,role:'platform_owner'}).success,false);
 assert.equal(c.registerBody.safeParse({email,firstName:'QA',lastName:'User',adultConfirmed:false}).success,false);
});

test('Blueprint and deployment commands remain protected and disabled by default',async()=>{
 await withServer('0',async(url,document)=>{
  for(const p of ["/api/v1/blueprint-configurations","/api/v1/blueprint-configurations/revisions","/api/v1/blueprint-configurations/submissions","/api/v1/blueprint-reviews","/api/v1/blueprint-executions","/api/v1/deployment-readiness-reviews","/api/v1/deployment-site-placements","/api/v1/offering-adoption-approvals"]){
   const op=document.paths[p].post;assert.ok(op.security);assert.ok(op.requestBody);assert.ok(op.responses['403']);
   assert.equal((await fetch(url+p,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
 });
});

test('Blueprint reads require credentials and have bounded history parameters',async()=>{
 await withServer('0',async(url,document)=>{
  const id='00000000-0000-4000-8000-000000000001';
  for(const p of ['/api/v1/blueprint-configurations/{configurationId}','/api/v1/blueprint-configuration-versions/{configurationVersionId}/review','/api/v1/blueprint-configuration-versions/{configurationVersionId}/review-history']){
   assert.ok(document.paths[p].get.security);
   assert.equal((await fetch(url+p.replace(/\{[^}]+\}/,id))).status,401);
  }
 });
 const {historyQuery}=require('../dist/workflow.contracts');
 assert.equal(historyQuery.safeParse({page:'100'}).success,true);
 assert.equal(historyQuery.safeParse({page:'101'}).success,false);
 assert.equal(historyQuery.safeParse({page:'0',organizationId:'forged'}).success,false);
});

test('participation APIs retain distinct receipts and never expose learner cookies in JSON',async()=>{
 await withServer('0',async(url,document)=>{
  for(const path of ['/api/v1/noncredit-registrations','/api/v1/class-enrollments']){
   assert.ok(document.paths[path].post.security);
   assert.ok(document.paths[path].post.responses['403']);
   assert.equal((await fetch(url+path,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
 });
 const {registrationResult,enrollmentResult}=require('../dist/participation.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(registrationResult.safeParse({registrationId:id,courseAttemptId:id,alreadyEnrolled:false,classId:null,classEnrollmentId:null}).success,true);
 assert.equal(registrationResult.safeParse({registrationId:id,courseAttemptId:id,alreadyEnrolled:false,classId:null,classEnrollmentId:null,cookie:'secret'}).success,false);
 assert.equal(enrollmentResult.safeParse({classEnrollmentId:id,courseAttemptId:id,alreadyEnrolled:false,registrationId:id}).success,false);
});

test('Classroom lifecycle commands document authority and remain disabled by default',async()=>{
 await withServer('0',async(url,document)=>{
  for(const p of ["/api/v1/class-session-schedules","/api/v1/class-session-schedule-changes","/api/v1/class-session-openings","/api/v1/class-session-revocations","/api/v1/classroom-control-transfers","/api/v1/class-session-agenda-revisions"]){
   const op=document.paths[p].post;
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.requestBody);
   assert.equal((await fetch(url+p,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
 });
});

test('Classroom Connect operations are independently documented and protected',async()=>{
 await withServer('0',async(url,document)=>{
  const id='00000000-0000-4000-8000-000000000001';
  for(const [method,route] of [["POST","/api/v1/classroom-pairings"],["POST","/api/v1/classroom-departures"],["POST","/api/v1/classroom-pairing-renewals"],["POST","/api/v1/classroom-closures"],["POST","/api/v1/classroom-playback-events"],["POST","/api/v1/classroom-attestations"],["POST","/api/v1/classroom-projector-commands"],["POST","/api/v1/classroom-activities"],["POST","/api/v1/classroom-activity-closures"],["POST","/api/v1/classroom-responses"],["POST","/api/v1/classroom-presence-events"],["GET","/api/v1/me/classroom-course-choices"],["GET","/api/v1/classrooms/{facilitatedSessionId}/attendance"],["GET","/api/v1/classrooms/{facilitatedSessionId}/projector"],["GET","/api/v1/classrooms/{facilitatedSessionId}/attempts/{courseAttemptId}/activities"],["GET","/api/v1/classrooms/{facilitatedSessionId}/presentation"]]){
   const op=document.paths[route][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {results}=require('../dist/room.contracts');
 assert.equal(results.presentationResult.safeParse({roomState:'live',current:null,note:'No private data',roster:[]}).success,false);
 assert.equal(results.responseResult.safeParse({saved:true,duplicate:false,graded:true}).success,false);
});

test('learner recovery and media access do not expose session secrets in response schemas',async()=>{
 await withServer('0',async(url,document)=>{
  for(const route of ['/api/v1/me/learning-session/resume','/api/v1/me/learning-session/activate','/api/v1/classroom-media-access']){
   assert.ok(document.paths[route].post.security);
   assert.equal((await fetch(url+route,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
  for(const route of ['/api/v1/classrooms/{facilitatedSessionId}/media','/api/v1/me/course-attempts/{courseAttemptId}/classrooms','/api/v1/classes/{classId}/sessions/{classSessionId}/agenda']){
   assert.ok(document.paths[route].get.security);
   assert.equal((await fetch(url+route.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'))).status,401);
  }
 });
 const {readyDoc}=require('../dist/participation.contracts');
 assert.deepEqual(Object.keys(readyDoc.properties),['ready']);
});

test('Class management has distinct activation, publication and closure operations',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["POST","/api/v1/classes"],["POST","/api/v1/class-activations"],["POST","/api/v1/class-offering-publications"],["POST","/api/v1/class-offering-closures"],["POST","/api/v1/class-offering-versions"],["GET","/api/v1/classes"],["GET","/api/v1/me/class-operator-sites"],["GET","/api/v1/class-course-options"]]){
   const op=document.paths[path][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+path,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {optionsQuery}=require('../dist/class-admin.contracts');
 assert.equal(optionsQuery.safeParse({cursor:'100001'}).success,false);
 assert.equal(optionsQuery.safeParse({siteId:'not-a-uuid'}).success,false);
 assert.equal(optionsQuery.safeParse({organizationId:'forged'}).success,false);
});

test('independent reviewer discovery and exact manuscript reads have protected HTTP contracts',async()=>{
 await withServer('0',async(url,document)=>{
  for(const route of ['/api/v1/blueprint-planning-context','/api/v1/offering-adoption-review-queue','/api/v1/offering-versions/{offeringVersionId}/review-content']){
   assert.ok(document.paths[route].get.security);assert.ok(document.paths[route].get.responses['403']);
   assert.equal((await fetch(url+route.replace('{offeringVersionId}','00000000-0000-4000-8000-000000000001'))).status,401);
  }
 });
 const {exactReviewQuery}=require('../dist/platform-commands.contracts');
 assert.equal(exactReviewQuery.safeParse({manifestId:'00000000-0000-4000-8000-000000000001',expectedHash:'a'.repeat(64)}).success,true);
 assert.equal(exactReviewQuery.safeParse({manifestId:'00000000-0000-4000-8000-000000000001',expectedHash:'a'.repeat(64),reviewerPersonId:'forged'}).success,false);
});

test('reporting endpoints protect source-owned evidence and never approve public disclosure',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,route] of [['GET','/api/v1/classes/{classId}/report'],['GET','/api/v1/me/reporting-relationship-portfolio'],['POST','/api/v1/reporting-relationships'],['POST','/api/v1/reporting-relationship-decisions']]){
   const op=document.paths[route][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route.replace('{classId}','00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {docs,reportQuery,metricKeys}=require('../dist/reporting.contracts');
 assert.deepEqual(docs.report.properties.publicationApproved.enum,[false]);
 assert.equal(metricKeys.length,16);
 assert.equal(reportQuery.safeParse({from:'2026-01-01',to:'2026-02-01',organizationId:'forged'}).success,false);
});

test('teacher and guardian workspace operations retain explicit authorization and bounded projections',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,route] of [["GET","/api/v1/me/teacher/classes"],["GET","/api/v1/me/teacher/today"],["GET","/api/v1/classes/{classId}/teacher/homework"],["GET","/api/v1/classes/{classId}/teacher/missing-work"],["GET","/api/v1/classes/{classId}/teacher/follow-ups"],["POST","/api/v1/classes/{classId}/teacher/follow-ups"],["GET","/api/v1/classes/{classId}/teacher/homework/{submissionId}/history"],["POST","/api/v1/classes/{classId}/teacher/practice-feedback"],["GET","/api/v1/classes/{classId}/teacher/assessment-readiness"],["GET","/api/v1/classes/{classId}/teacher/historical-work"],["GET","/api/v1/me/guardian/learners"],["GET","/api/v1/me/guardian/class-approvals"],["GET","/api/v1/me/guardian/class-enrollments"],["GET","/api/v1/me/guardian/community"],["POST","/api/v1/guardian-class-approval-requests"],["POST","/api/v1/guardian-class-approval-acceptances"],["POST","/api/v1/guardian-class-withdrawals"]]){
   const op=document.paths[route][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies,results,queries}=require('../dist/role-workspaces.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(bodies.feedback.safeParse({submissionId:id,feedback:'Review this answer',practiceScore:8,officialGrade:100}).success,false);
 assert.equal(bodies.accept.safeParse({approvalRequestId:id,creditMode:'for_credit',consentAccepted:true}).success,false);
 assert.equal(queries.page.safeParse({offset:'1000001'}).success,false);
 assert.equal(results.followUp.safeParse({actionId:null,created:false,assignedToAnotherTeacher:true}).success,true);
});
