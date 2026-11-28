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

test('explicit domain input errors map to 400 while local response schema failures remain internal',async()=>{
 const {CanonicalIdentityService}=require('../dist/identity.service');
 const {z}=require('zod');
 const service=new CanonicalIdentityService();
 service.configure(true);
 service.bridge={classifyHttpDomainError:error=>error?.code==='VALIDATION_FAILED'?'validation':'unexpected'};
 await assert.rejects(()=>service.runWorkflow(async()=>{throw Object.assign(new Error('private value'),{code:'VALIDATION_FAILED'});}),e=>e.getStatus()===400&&!e.message.includes('private value'));
 await assert.rejects(()=>service.runWorkflow(async()=>z.string().parse(123)),e=>e.name==='ZodError');
});

test('cross-package schema failure cannot be mistaken for caller validation',async()=>{
 const {CanonicalIdentityService}=require('../dist/identity.service');
 const service=new CanonicalIdentityService();
 service.configure(true);
 service.bridge={classifyHttpDomainError:error=>error?.name==='ZodError'?'unexpected':'validation'};
 await assert.rejects(()=>service.runWorkflow(async()=>{throw Object.assign(Error('private persistence value'),{name:'ZodError'});}),e=>e.message==='Unexpected domain failure');
});

test('program launch commands do not collapse evidence submission, review and activation',async()=>{
 await withServer('0',async(url,document)=>{
  for(const path of ["/api/v1/program-launches","/api/v1/launch-requirement-completions","/api/v1/launch-evidence-submissions","/api/v1/launch-evidence-decisions","/api/v1/program-launch-activations","/api/v1/launch-orientations"]){
   const op=document.paths[path].post;assert.ok(op.security);assert.ok(op.requestBody);assert.ok(op.responses['403']);
   assert.equal((await fetch(url+path,{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
 });
 const {bodies}=require('../dist/launch.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(bodies.complete.safeParse({journeyRequirementId:id,confirmed:false}).success,false);
 assert.equal(bodies.submit.safeParse({journeyRequirementId:id,statement:'Reviewed documentation',decision:'accepted'}).success,false);
 assert.equal(bodies.activate.safeParse({programId:id,overrideReadiness:true}).success,false);
});

test('Site V6.1 planning separates existing Programs from private intent and requires a revision',async()=>{
 await withServer('0',async(url,document)=>{
  const id='00000000-0000-4000-8000-000000000001';
  for(const [method,route] of [["GET","/api/v1/sites/{siteId}/information"],["POST","/api/v1/sites/{siteId}/information"],["GET","/api/v1/sites/{siteId}/programs"],["GET","/api/v1/sites/{siteId}/programs-audiences"],["POST","/api/v1/sites/{siteId}/programs-audiences"]]){
   assert.ok(document.paths[route][method.toLowerCase()].security);
   const response=await fetch(url+route.replace('{siteId}',id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {informationBody,audiencesBody}=require('../dist/site-planning.contracts');
 const expectedRevision='2026-11-28T00:00:00Z';
 assert.equal(informationBody.safeParse({expectedRevision,section:'environment',environment:{delivery:'digital',physicalSpaceArrangement:''}}).success,true);
 assert.equal(informationBody.safeParse({expectedRevision,siteId:'forged',section:'environment',environment:{delivery:'digital',physicalSpaceArrangement:''}}).success,false);
 const intent={interestIds:[],timingIds:[],audienceIds:[],startingFocus:null,customExperiences:['one','two','three','four','five','six']};
 assert.equal(audiencesBody.safeParse({expectedRevision,intent}).success,false);
 assert.equal(audiencesBody.safeParse({intent:{...intent,customExperiences:[]}}).success,false);
});

test('Brand versions and website copy review remain independently protected',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["GET","/api/v1/sites/{siteId}/brand"],["POST","/api/v1/sites/{siteId}/brand-versions"],["POST","/api/v1/sites/{siteId}/brand-assets/{assetId}/revocation"],["GET","/api/v1/sites/{siteId}/publication-readiness"],["POST","/api/v1/sites/{siteId}/website-copy-reviews"]]){
   assert.ok(document.paths[path][method.toLowerCase()].security);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies}=require('../dist/brand.contracts');
 assert.equal(bodies.review.safeParse({expectedRevision:0,contentReviewed:true,publishSite:true}).success,false);
 assert.equal(bodies.revoke.safeParse({reason:'Rights withdrawn',assetId:'forged'}).success,false);
});

test('Site profile endpoints are protected and use exact revisions',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,route] of [["GET","/api/v1/sites/{siteId}/profile"],["POST","/api/v1/sites/{siteId}/physical-address"],["POST","/api/v1/sites/{siteId}/contact"],["POST","/api/v1/sites/{siteId}/identity"],["POST","/api/v1/sites/{siteId}/legacy-information"]]){
   const op=document.paths[route][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['409']);
   const response=await fetch(url+route.replace('{siteId}','00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies}=require('../dist/site-profile.contracts');
 assert.equal(bodies.address.safeParse({address:null}).success,false);
 assert.equal(bodies.contact.safeParse({expectedRevision:'2026-11-28T00:00:00Z',contact:null,publicClaimApproved:true}).success,false);
});

test('publication decisions remain independently authorized and reject enrollment overrides',async()=>{
 await withServer('0',async(url,document)=>{
  for(const route of ["/api/v1/sites/{siteId}/public-identity-changes","/api/v1/sites/{siteId}/public-address-reservations","/api/v1/sites/{siteId}/publication-decisions","/api/v1/sites/{siteId}/programs/{programId}/marketing-decisions"]){
   const op=document.paths[route].post;assert.ok(op.security);assert.ok(op.responses['409']);
   assert.equal((await fetch(url+route.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'),{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:'{}'})).status,503);
  }
 });
 const {bodies}=require('../dist/site-publishing.contracts');
 assert.equal(bodies.publish.safeParse({action:'publish',expectedRevision:'2026-11-28T00:00:00Z',reason:'Reviewed website copy',contentReviewed:true,openEnrollment:true}).success,false);
});

test('Go Link management is Site scoped and rejects arbitrary redirect destinations',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["POST","/api/v1/sites/{siteId}/go-links"],["GET","/api/v1/sites/{siteId}/go-links"],["GET","/api/v1/sites/{siteId}/go-link-destinations"],["GET","/api/v1/sites/{siteId}/go-links/{linkId}/inspection"],["POST","/api/v1/sites/{siteId}/go-links/{linkId}/status"],["POST","/api/v1/sites/{siteId}/go-links/{linkId}/revocation"]]){
   assert.ok(document.paths[path][method.toLowerCase()].security);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies,queries}=require('../dist/go-links.contracts');
 const requestId='00000000-0000-4000-8000-000000000001';
 assert.equal(bodies.create.safeParse({requestId,destination:{kind:'url',href:'https://foreign.example'}}).success,false);
 assert.equal(bodies.create.safeParse({destination:{kind:'site-page',page:'home'}}).success,false);
 assert.equal(queries.page.safeParse({limit:'51'}).success,false);
});

test('private Website and Brand workflow keeps publication distinct and requires both revisions',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["GET","/api/v1/sites/{siteId}/website-preview"],["POST","/api/v1/sites/{siteId}/website-preview"],["POST","/api/v1/sites/{siteId}/website-and-brand-versions"],["POST","/api/v1/sites/{siteId}/website-restorations"],["POST","/api/v1/sites/{siteId}/website-preparations"]]){
   assert.ok(document.paths[path][method.toLowerCase()].security);
   const response=await fetch(url+path.replace('{siteId}','00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies}=require('../dist/website.contracts');
 assert.equal(bodies.restore.safeParse({expectedRevision:1,restoreRevision:1,publish:true}).success,false);
 assert.equal(bodies.save.safeParse({operation:'save',expectedRevision:1}).success,false);
});

test('frozen preview sharing has protected contracts and does not accept arbitrary snapshots',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["GET","/api/v1/sites/{siteId}/preview-shares"],["POST","/api/v1/sites/{siteId}/preview-shares"],["POST","/api/v1/sites/{siteId}/preview-shares/{shareId}/status"],["POST","/api/v1/sites/{siteId}/preview-shares/{shareId}/revocation"]]){
   assert.ok(document.paths[path][method.toLowerCase()].security);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {bodies,results}=require('../dist/preview-shares.contracts');
 const requestId='00000000-0000-4000-8000-000000000001';
 assert.equal(bodies.create.safeParse({requestId,expiresAfterDays:7}).success,true);
 assert.equal(bodies.create.safeParse({requestId,expiresAfterDays:null,snapshotId:requestId}).success,false);
 assert.equal(bodies.create.safeParse({requestId,expiresAfterDays:1}).success,false);
 assert.equal(results.create.safeParse({shareId:requestId,relativeUrl:'https://foreign.example',expiresAt:null,sourceRevision:1}).success,false);
});

test('catalog discovery is governed and cannot assert activation or expose private read-only plans',async()=>{
 await withServer('0',async(url,document)=>{
  for(const path of ["/api/v1/sites/{siteId}/program-references","/api/v1/sites/{siteId}/available-offerings","/api/v1/sites/{siteId}/solution-workspace","/api/v1/blueprint-review-queue","/api/v1/organizations/{organizationId}/blueprint-review-evidence"]){
   assert.ok(document.paths[path].get.security);
   assert.equal((await fetch(url+path.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001'))).status,401);
  }
 });
 const {results,queries}=require('../dist/catalog.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(queries.offerings.safeParse({deliveryContext:'remote',geographicAreaId:id}).success,false);
 assert.equal(results.offerings.safeParse([{offering:{offeringId:id,offeringVersionId:id,code:'test',title:'Test',versionNo:1},availability:[],activationEligible:true}]).success,false);
 const workspace={siteId:id,organizationId:id,canConfigure:false,canReview:false,canExecute:false,affiliations:[],operations:[],templates:[],configurations:[]};
 assert.equal(results.workspace.safeParse(workspace).success,true);
 assert.equal(results.workspace.safeParse({...workspace,operations:[{id,name:'private'}]}).success,false);
});

test('launch workspace drafts are revisioned, role-bound, and reject supplied identity',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [["GET","/api/v1/me/staff-launch-workspace"],["GET","/api/v1/me/launch-drafts"],["POST","/api/v1/me/launch-drafts"],["GET","/api/v1/me/launch-options"],["GET","/api/v1/me/launch-entry"]]){
   assert.ok(document.paths[path][method.toLowerCase()].security);
   const response=await fetch(url+path,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const {save,entry}=require('../dist/launch-workspace.contracts');
 const valid={audience:'staff',context:'preparation',expectedRevision:0,value:{audience:'staff',fields:{notes:'private'}}};
 assert.equal(save.safeParse(valid).success,true);
 assert.equal(save.safeParse({...valid,accountId:'forged'}).success,false);
 assert.equal(save.safeParse({...valid,audience:'family'}).success,false);
 assert.equal(entry.safeParse({siteId:'invalid'}).success,false);
});

test('all registered OpenAPI operations have unique IDs and explicit security posture',async()=>{
 await withServer('0',async(url,document)=>{
  const ids=new Set();
  const anonymous=new Set(['getLiveness','requestAccessLink','verifyAccess','registerAccount','requestSiteSignup']);
  const methods=new Set(['get','post','put','patch','delete','head','options']);
  for(const [path,item] of Object.entries(document.paths)){
   assert.ok(path.startsWith('/api/v1/'),path);
   for(const [method,op] of Object.entries(item)){
    if(!methods.has(method))continue;
    assert.ok(op.operationId,path+' '+method);
    assert.ok(!ids.has(op.operationId),'Duplicate operationId '+op.operationId);
    ids.add(op.operationId);
    if(!anonymous.has(op.operationId))assert.ok(op.security?.length,'Missing security: '+op.operationId);
    assert.ok(Object.keys(op.responses??{}).some(s=>/^2\d\d$/.test(s)),'Missing success response: '+op.operationId);
    for(const match of path.matchAll(/\{([^}]+)\}/g)){
     assert.ok([...(item.parameters??[]),...(op.parameters??[])].some(p=>p.in==='path'&&p.name===match[1]&&p.required===true),'Missing required path parameter: '+op.operationId+' '+match[1]);
    }
   }
  }
  assert.ok(ids.size>=148,'Expected existing migration coverage including liveness');
 });
});

test('actual browser SDK projection retains all operations while canonical writes require Origin',async()=>{
 const {browserSdkDocument}=require('../scripts/browser-sdk-document.cjs');
 await withServer('0',async(url,document)=>{
  const browser=browserSdkDocument(document);
  let writes=0;
  for(const [path,item] of Object.entries(document.paths)){
   for(const method of ['get','post','put','patch','delete']){
    const operation=item[method];
    if(!operation)continue;
    const projected=browser.paths[path][method];
    assert.equal(projected.operationId,operation.operationId);
    assert.deepEqual(projected.security,operation.security);
    assert.deepEqual(projected.requestBody,operation.requestBody);
    assert.deepEqual(projected.responses,operation.responses);
    if(method==='post'){
     writes++;
     assert.ok([...(item.parameters??[]),...(operation.parameters??[])].some(p=>p.in==='header'&&p.name.toLowerCase()==='origin'&&p.required===true),'Missing canonical Origin: '+operation.operationId);
    }
    assert.ok(![...(browser.paths[path].parameters??[]),...(projected.parameters??[])].some(p=>p.in==='header'&&['origin','cookie','sec-fetch-site'].includes(p.name.toLowerCase())),'Browser-owned input: '+operation.operationId);
   }
  }
  assert.ok(writes>0);
 });
});

test('campaign management contracts keep recipient consent and provider credentials separate',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/engagement-campaigns/workspace","GET"],["/api/v1/campaign-recipient-lists","POST"],["/api/v1/engagement-campaigns","POST"],["/api/v1/engagement-campaign-cancellations","POST"],["/api/v1/campaign-recipient-lists/members","GET"],["/api/v1/campaign-recipient-list-member-decisions","POST"]]){
   const op=document.paths[route][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
   assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const schema=document.paths['/api/v1/engagement-campaigns/workspace'].get.responses['200'].content['application/json'].schema;
  assert.deepEqual(Object.keys(schema.properties).sort(),['campaigns','lists','senderIssues','senderLabel','senderReady']);
  assert.ok(!JSON.stringify(schema).includes('apiKey'));
 });
 const c=require('../dist/campaign.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(c.membersQuery.parse({engagementId:id,linkId:id,listId:id,offset:'50'}).offset,50);
 for(const offset of ['','-1','1001','1.5','1e2'])assert.equal(c.membersQuery.safeParse({engagementId:id,linkId:id,listId:id,offset}).success,false);
 assert.equal(c.membersQuery.safeParse({engagementId:id,linkId:id,listId:id,offset:'0',ownerScope:'forged'}).success,false);
 assert.equal(c.results.workspace.safeParse({lists:[],campaigns:[],senderReady:true,senderIssues:[],senderLabel:'Organization',apiKey:'forbidden'}).success,false);
});

test('sender administration retains explicit owner authorization and bounded discovery',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/communication-senders/current","GET"],["/api/v1/communication-senders/organizations","GET"],["/api/v1/communication-sender-approvals","POST"],["/api/v1/communication-sender-revocations","POST"]]){
   const op=document.paths[route][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const c=require('../dist/sender-admin.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(c.scopeQuery.parse({}),{organizationId:null});
 assert.equal(c.scopeQuery.safeParse({organizationId:'null'}).success,false);
 assert.equal(c.scopeQuery.safeParse({actorPersonId:id}).success,false);
 assert.equal(c.pageQuery.parse({}).limit,50);
 assert.equal(c.pageQuery.safeParse({limit:'101'}).success,false);
 assert.equal(c.pageQuery.safeParse({afterId:id}).success,false);
 assert.equal(c.pageQuery.safeParse({afterId:id,afterName:'Example'}).success,true);
 assert.equal(c.results.current.safeParse({id,sender_from:'sender@example.test',postal_address:'address',verification_reference:'reference',apiKey:'secret'}).success,false);
});

test('engagement registry protects publication, owned discovery and invitation preparation',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/engagement-definitions","POST"],["/api/v1/engagement-go-links","POST"],["/api/v1/engagement-go-links","GET"],["/api/v1/engagement-retirements","POST"],["/api/v1/engagement-go-link-revocations","POST"],["/api/v1/site-engagement-definitions","GET"],["/api/v1/engagement-email-draft","GET"],["/api/v1/engagement-owner-destinations","GET"],["/api/v1/owner-engagement-definitions","GET"]]){
   const op=document.paths[route][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const c=require('../dist/engagement.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.deepEqual(c.ownerQuery.parse({ownerKind:'platform'}),{owner:{kind:'platform'}});
 assert.equal(c.ownerQuery.safeParse({ownerKind:'platform',organizationId:id}).success,false);
 assert.equal(c.ownerQuery.safeParse({ownerKind:'organization'}).success,false);
 assert.deepEqual(c.ownerQuery.parse({ownerKind:'organization',organizationId:id}),{owner:{kind:'organization',organizationId:id}});
 assert.equal(c.linkQuery.safeParse({engagementId:id,linkId:id,actorPersonId:id}).success,false);
 assert.equal(c.results.draft.safeParse({subject:'Invitation',body:'Public copy',url:'https://app.example.test/go/abcdefgh1234',recipientEmail:'private@example.test'}).success,false);
});

test('marketing package routes preserve revision and Site boundaries',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/site-marketing-suggestions","GET"],["/api/v1/site-marketing-packages","GET"],["/api/v1/site-marketing-packages","POST"],["/api/v1/site-marketing-package-revisions","POST"],["/api/v1/site-marketing-package-copies","POST"],["/api/v1/site-marketing-package-status","POST"],["/api/v1/site-marketing-package-brand","POST"],["/api/v1/site-marketing-package-deletions","POST"]]){
   const op=document.paths[route][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
  assert.ok(document.paths['/api/v1/site-marketing-package-revisions'].post.requestBody.content['application/json'].schema.required.includes('expectedRevision'));
 });
 const c=require('../dist/marketing-packages.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(c.pageQuery.safeParse({siteId:id,limit:'101'}).success,false);
 assert.equal(c.pageQuery.safeParse({siteId:id,ownerPersonId:id}).success,false);
 assert.equal(c.pageQuery.parse({siteId:id,limit:'20'}).limit,20);
});

test('marketing artifact APIs distinguish preview, immutable release, output and withdrawal',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/site-marketing-artifact-previews","POST"],["/api/v1/site-marketing-package-releases","POST"],["/api/v1/site-marketing-package-releases","GET"],["/api/v1/site-marketing-artifact-releases","GET"],["/api/v1/site-marketing-artifact-output","GET"],["/api/v1/site-marketing-artifact-withdrawals","POST"]]){
   const op=document.paths[route][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
  const schema=document.paths['/api/v1/site-marketing-package-releases'].post.requestBody.content['application/json'].schema;
  assert.ok(schema.required.includes('requestId'));assert.ok(schema.required.includes('expectedPackageRevision'));
 });
 const c=require('../dist/marketing-artifacts.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(c.release.safeParse({siteId:id,releaseId:id,actorPersonId:id}).success,false);
 assert.equal(c.results.preview.safeParse({state:'missing-brand',body:'not distributable'}).success,false);
 assert.equal(c.results.output.safeParse({format:'email',content:'x',mimeType:'text/html',fileName:'x.html',plainText:null}).success,true);
});

test('survey contracts distinguish canonical publisher, independent reviewer and learner operations',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/survey-drafts","GET"],["/api/v1/survey-drafts","POST"],["/api/v1/survey-review-queue","GET"],["/api/v1/survey-publication-queue","GET"],["/api/v1/survey-reviews","POST"],["/api/v1/survey-publications","POST"],["/api/v1/course-surveys","GET"],["/api/v1/course-survey","GET"],["/api/v1/course-survey-responses","POST"]]){
   const op=document.paths[route][method.toLowerCase()];assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 });
 const c=require('../dist/surveys.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(c.scope.safeParse({courseAttemptId:id,campaignId:id,personId:id}).success,false);
 assert.equal(c.results.response.safeParse({responseId:id,alreadySubmitted:false,answers:[]}).success,false);
 assert.equal(c.results.publication.safeParse({surveyVersionId:id,lifecycle:'draft'}).success,false);
});

test('class and classroom surveys expose only governed campaign metadata',async()=>{
 await withServer('0',async(url,document)=>{
  for(const [route,method] of [["/api/v1/class-survey-campaign-options","GET"],["/api/v1/class-survey-campaign-links","POST"],["/api/v1/classroom-survey-options","GET"],["/api/v1/classroom-survey-links","POST"],["/api/v1/classroom-learner-surveys","GET"]]){
   assert.ok(document.paths[route][method.toLowerCase()].security);
   const response=await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
   assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  }
 });
 const c=require('../dist/surveys.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(c.roomLearnerQuery.safeParse({facilitatedSessionId:id,courseAttemptId:id,personId:id}).success,false);
 assert.equal(c.classRoomResults.roomLearner.safeParse({surveys:[],notice:'',answers:[]}).success,false);
});

test('operational reporting exposes private evidence without treating it as publication approval',async()=>{
 await withServer('0',async(url,document)=>{
  for(const route of ["/api/v1/reports/noncredit-pilot-outcomes","/api/v1/reports/noncredit-operator-summary","/api/v1/reports/facilitated-impact"]){assert.ok(document.paths[route].get.security);assert.equal((await fetch(url+route)).status,401);}
 });
 const c=require('../dist/outcomes.contracts');
 assert.equal(c.pilotQuery.safeParse({geography:'US-CA',organizationId:'forged'}).success,false);
 assert.equal(c.pilotQuery.safeParse({geography:'US-CA'}).success,true);
 assert.equal(c.pilotQuery.safeParse({geography:'invalid'}).success,false);
});

test('knowledge checks and completion require verified learner or provider authority',async()=>{await withServer('0',async(url,document)=>{for(const [route,method] of [["/api/v1/knowledge-check","GET"],["/api/v1/knowledge-check-attempts","POST"],["/api/v1/knowledge-check-draft-answers","POST"],["/api/v1/knowledge-check-submissions","POST"],["/api/v1/knowledge-check-finalizations","POST"],["/api/v1/knowledge-check-access","POST"],["/api/v1/completion-readiness","GET"]]){assert.ok(document.paths[route][method.toLowerCase()].security);assert.equal((await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined)).status,method==='POST'?503:401);}});const c=require('../dist/knowledge-check.contracts');const id='00000000-0000-4000-8000-000000000001';assert.equal(c.courseQuery.safeParse({courseAttemptId:id,phase:'baseline'}).success,true);assert.equal(c.courseQuery.safeParse({courseAttemptId:id,phase:'other'}).success,false);assert.equal(c.courseQuery.safeParse({courseAttemptId:id,learnerId:id}).success,false);assert.equal(c.results.grant.safeParse({accessGrantId:id,courseAttemptId:id,created:true,correctOptionIds:[id]}).success,false);});

test('noncredit enrollment publication protects provider scope and explicit Site selection',async()=>{await withServer('0',async(url,document)=>{for(const [route,method] of [["/api/v1/noncredit-enrollment-publisher","GET"],["/api/v1/noncredit-training-readiness","GET"],["/api/v1/noncredit-enrollment-releases","POST"],["/api/v1/noncredit-enrollment-closures","POST"],["/api/v1/noncredit-multisite-releases","POST"]]){assert.ok(document.paths[route][method.toLowerCase()].security);assert.equal((await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined)).status,method==='POST'?503:401);}assert.ok(document.paths['/api/v1/noncredit-enrollment-releases'].post.requestBody.content['application/json'].schema.required.includes('siteId'));});});

test('completion administration requires canonical provider credentials and distinguishes decisions from corrections',async()=>{await withServer('0',async(url,document)=>{for(const [route,method] of [["/api/v1/noncredit-completion-decisions","POST"],["/api/v1/noncredit-completion-policy-catalog","GET"],["/api/v1/noncredit-completion-policies","POST"],["/api/v1/noncredit-completion-review","GET"],["/api/v1/noncredit-completion-queue","GET"],["/api/v1/noncredit-completion-corrections","POST"]]){assert.ok(document.paths[route][method.toLowerCase()].security);assert.equal((await fetch(url+route,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined)).status,method==='POST'?503:401);}});const c=require('../dist/completion-admin.contracts');assert.equal(c.queueQuery.safeParse({page:'101'}).success,false);assert.equal(c.queueQuery.parse({page:'2'}).page,2);});

test('waitlist and withdrawal are private standard operations with strict distinct contracts',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 await withServer('0',async(url,document)=>{
  for(const [method,path] of [['POST','/api/v1/noncredit-waitlist-entries'],['POST','/api/v1/noncredit-waitlist-cancellations'],['GET','/api/v1/me/noncredit-waitlist'],['POST','/api/v1/noncredit-registration-withdrawals']]){
   const op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);
   if(method==='POST')assert.ok(op.requestBody);
   const res=await fetch(url+path,method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(res.status,method==='POST'?503:401);
  }
 });
 const c=require('../dist/participation.contracts');
 const terms={releaseId:id,consentVersion:'v01',consentSha256:'a'.repeat(64),acceptedConsent:true,adultConfirmed:true};
 assert.equal(c.waitlistJoinInput.safeParse(terms).success,true);
 for(const field of ['personId','accountId','siteId','classId','registrationId'])assert.equal(c.waitlistJoinInput.safeParse({...terms,[field]:id}).success,false);
 assert.equal(c.waitlistJoinInput.safeParse({...terms,adultConfirmed:false}).success,false);
 assert.equal(c.waitlistQuery.safeParse({joinedAt:'2026-11-28T00:00:00Z'}).success,false);
 assert.equal(c.waitlistQuery.safeParse({joinedAt:'2026-11-28T00:00:00.123456Z',waitlistId:id}).success,true);
 assert.equal(c.waitlistPageResult.safeParse({items:[],nextCursor:null}).success,true);
 assert.equal(c.waitlistPageResult.safeParse({items:[],nextCursor:null,accountId:id}).success,false);
 assert.equal(c.waitlistJoinResult.safeParse({status:'waiting',alreadyQueued:false,courseAttemptId:id}).success,false);
 assert.equal(c.withdrawRegistrationInput.safeParse({registrationId:id,confirm:false}).success,false);
 assert.equal(c.withdrawRegistrationResult.safeParse({withdrawn:true,alreadyWithdrawn:true}).success,true);
});
