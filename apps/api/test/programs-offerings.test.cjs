const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi, readConfig } = require('../dist/bootstrap');
const { CanonicalIdentityService } = require('../dist/identity.service');
const { ProgramsOfferingsModule } = require('../dist/programs-offerings.module');
const { NativeCourseDraftController } = require('../dist/native-course-draft.controller');
const { PublisherPackController } = require('../dist/publisher-pack.controller');
const { CurriculumMarketplaceController } = require('../dist/curriculum-marketplace.controller');
const { InstructionalTrackAuthoringController } = require('../dist/instructional-track-authoring.controller');
const { CurriculumAuthoringController } = require('../dist/curriculum-authoring.controller');
const { CatalogController } = require('../dist/catalog.controller');
const { WorkflowController } = require('../dist/workflow.controller');
const { OfferingReleaseController } = require('../dist/platform-commands.controller');
const { NoncreditPublicationController } = require('../dist/noncredit-publication.controller');

test('WS04 registers its controllers once and shares the configured identity service', async () => {
  const { app, document } = await createApi(readConfig({ API_DOCS: '0' }));
  try {
    const domain = app.select(ProgramsOfferingsModule);
    const identity = app.get(CanonicalIdentityService);
    for (const Controller of [CatalogController, WorkflowController, OfferingReleaseController, NoncreditPublicationController, NativeCourseDraftController, PublisherPackController, CurriculumMarketplaceController, InstructionalTrackAuthoringController, CurriculumAuthoringController]) {
      const instance = domain.get(Controller, { strict: true });
      assert.equal(instance.identity, identity);
    }
    const ids = Object.values(document.paths).flatMap(path =>
      Object.values(path).filter(operation => operation?.operationId).map(operation => operation.operationId));
    assert.equal(ids.length, new Set(ids).size, 'operationIds must be unique');
    for (const id of [
      'exploreCanonicalBlueprintReferences', 'discoverCanonicalBlueprintOfferings',
      'readCanonicalBlueprintWorkspace', 'listCanonicalBlueprintReviews', 'listCanonicalBlueprintReviewEvidence',
      'createCanonicalBlueprintConfiguration', 'saveCanonicalBlueprintConfiguration',
      'submitCanonicalBlueprintConfiguration', 'decideCanonicalBlueprintReview',
      'executeCanonicalBlueprintConfiguration', 'recordNativeDeploymentReadiness',
      'placeNativeDeploymentSite', 'approveNativeOfferingAdoption', 'getBlueprintConfiguration',
      'getBlueprintReview', 'getBlueprintReviewHistory', 'getBlueprintPlanningContext',
      'listOfferingAdoptionReviewQueue', 'getExactOfferingReviewContent', 'listReleaseReviewQueue',
      'getReleaseOverview', 'getReleasePolicy', 'submitRelease', 'saveReleasePolicy', 'decideRelease',
      'publishCourses', 'approveAssetManifest', 'publishOffering', 'getNoncreditEnrollmentPublisher',
      'getNoncreditTrainingReadiness', 'publishNoncreditSelfEnrollment', 'closeNoncreditSelfEnrollment',
      'publishNoncreditAcrossAuthorizedSites',
      'getNativeCourseDraftLessons', 'saveNativeCourseLessonDraft', 'getNativeCourseReleaseReadiness', 'createNativeCourseAssignmentDraft', 'getNativeCourseAssignmentDrafts', 'getPublisherPackStudio', 'createAuthoredPublisherPack', 'startPublisherPackDraft', 'saveAuthoredPublisherPack', 'publishAuthoredPublisherPack',
      'getCurriculumAdopterPrograms', 'getCurriculumJourneyReadiness', 'getCurriculumMarketplace', 'installCurriculumPack', 'adoptCurriculumPack', 'reviewAnnualCurriculumAdoption', 'rolloverAnnualCurriculumAdoption', 'rollbackAnnualCurriculumPackAdoption', 'addMarketplaceSupplement',
      'createRecordedInstructionDraft', 'saveRecordedInstructionDraft', 'submitRecordedInstructionDraft', 'decideRecordedInstructionReview', 'publishRecordedInstruction', 'withdrawRecordedInstruction', 'getCreatorRecordedInstructionDraft', 'getRecordedInstructionReview',
      'getCurriculumPrograms', 'getCurriculumStudio', 'createAuthoredCourse', 'startCurriculumDraft', 'saveAuthoredCurriculum', 'saveAuthoredLesson', 'publishAuthoredCurriculum'
    ]) {
      assert.ok(ids.includes(id), 'Missing WS04 operation: ' + id);
    }
  } finally {
    await app.close();
  }
});

test('WS04 configuration and review GETs reject caller-supplied authority or unexpected query fields', async () => {
  const { app } = await createApi(readConfig({ API_DOCS: '0' }));
  const id = '00000000-0000-4000-8000-000000000001';
  const identity = app.get(CanonicalIdentityService);
  let calls = 0;
  // Stub only the in-process identity port. Production routing and the default-deny
  // guard are unchanged; real session/RLS acceptance is a separate mandatory gate.
  identity.authenticateWorkflow = async (_request, mode, method) => {
    assert.equal(mode, 'planning');
    assert.equal(method, 'GET');
    return {
      readCanonicalBlueprintConfiguration: async () => { calls++; throw new Error('must not dispatch'); },
      readCanonicalBlueprintReview: async () => { calls++; throw new Error('must not dispatch'); },
    };
  };
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    for (const path of [
      '/api/v1/blueprint-configurations/' + id,
      '/api/v1/blueprint-configuration-versions/' + id + '/review'
    ]) {
      const response = await fetch(url + path + '?actorPersonId=' + id);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VALIDATION_FAILED');
    }
    assert.equal(calls, 0);
  } finally {
    await app.close();
  }
});

test('native curriculum routes remain authenticated and expose restricted draft contracts',async()=>{
 const { app,document }=await createApi(readConfig({API_DOCS:'0'}));
 const id='00000000-0000-4000-8000-000000000001';
 try{
  await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  for(const [path,method] of [["/api/v1/course-versions/{courseVersionId}/draft-lessons","GET"],["/api/v1/course-versions/{courseVersionId}/draft-lessons/{lessonId}/revisions","POST"],["/api/v1/course-versions/{courseVersionId}/release-readiness","GET"],["/api/v1/course-versions/{courseVersionId}/draft-assignments","POST"],["/api/v1/course-versions/{courseVersionId}/draft-assignments","GET"]]){
   const op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 }finally{await app.close();}
});
test('native lesson boundary denies hidden fields, invalid duration and caller authority',()=>{
 const {inputs,results}=require('../dist/native-course-draft.contracts');
 const lesson={title:'Lesson title',objectives:['Learn the topic'],segments:[{title:'Introduction',minutes:30}],expectedRevision:'a'.repeat(64)};
 assert.equal(inputs.lesson.safeParse(lesson).success,true);
 assert.equal(inputs.lesson.safeParse({...lesson,actorPersonId:'forged'}).success,false);
 assert.equal(inputs.lesson.safeParse({...lesson,answers:['secret']}).success,false);
 assert.equal(inputs.lesson.safeParse({...lesson,segments:Array(3).fill({title:'Long section',minutes:90})}).success,false);
 assert.equal(inputs.lesson.safeParse({...lesson,expectedRevision:'bad'}).success,false);
 assert.equal(inputs.assignment.safeParse({assignmentKey:'assignment_1',title:'Assignment',instructions:'Write an answer',required:true,sectionId:'forged'}).success,false);
 assert.equal(results.saved.safeParse({revision:'a'.repeat(64),changed:true,published:true}).success,false);
});

test('Publisher Pack endpoints require standard authenticated scope and protect command input',async()=>{
 const {app,document}=await createApi(readConfig({API_DOCS:'0'}));
 const id='00000000-0000-4000-8000-000000000001';
 try{
  await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  const base='/api/v1/programs/{programId}/publisher-packs';
  for(const [suffix,method] of [['','GET'],['','POST'],['/{packId}/drafts','POST'],['/versions/{versionId}/revisions','POST'],['/versions/{versionId}/publication','POST']]){
   const path=base+suffix,op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 }finally{await app.close();}
});
test('Publisher Pack contract rejects duplicate courses, hidden authority and unconfirmed publication',()=>{
 const {inputs,results}=require('../dist/publisher-pack.contracts');
 const id='00000000-0000-4000-8000-000000000001',expectedRevision='a'.repeat(64);
 assert.equal(inputs.save.safeParse({expectedRevision,courseVersionIds:[id]}).success,true);
 assert.equal(inputs.save.safeParse({expectedRevision,courseVersionIds:[id,id]}).success,false);
 assert.equal(inputs.publish.safeParse({expectedRevision,confirmed:false,reason:'Reviewed publication'}).success,false);
 assert.equal(inputs.publish.safeParse({expectedRevision,confirmed:true,reason:'Reviewed publication',reviewerPersonId:id}).success,false);
 assert.equal(results.draft.safeParse({versionId:id,created:true,offeringPublished:true}).success,false);
});

test('native Course lesson paging exposes continuation and rejects unreasonable offsets',()=>{
 const {queries,results}=require('../dist/native-course-draft.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(queries.assignments.parse({offset:'80'}).offset,80);
 assert.equal(queries.assignments.safeParse({offset:'1000001'}).success,false);
 assert.equal(queries.assignments.safeParse({offset:'-1'}).success,false);
 const result={courseVersionId:id,courseTitle:'Course',versionNo:1,limited:false,nextOffset:null,lessons:[]};
 assert.equal(results.lessons.safeParse(result).success,true);
 assert.equal(results.lessons.safeParse({...result,nextOffset:-1}).success,false);
});

test('Marketplace routes are protected and enforce explicit Program/year authority',async()=>{
 const {app,document}=await createApi(readConfig({API_DOCS:'0'}));
 const id='00000000-0000-4000-8000-000000000001';
 try{
  await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  const base='/api/v1/programs/{programId}/';
  const annual=base+'curriculum-packs/{packId}/academic-years/{academicYearId}/adoption';
  for(const [path,method] of [
   ['/api/v1/curriculum-adopter-programs','GET'],[base+'curriculum-journey-readiness','GET'],
   [base+'curriculum-marketplace','GET'],[base+'curriculum-entitlements','POST'],
   [base+'curriculum-adoptions','POST'],[annual,'GET'],[annual,'POST'],
   [annual+'/rollbacks','POST'],[base+'curriculum-supplements','POST']
  ]){
   const op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 }finally{await app.close();}
});
test('Marketplace contracts reject license bypass, forged scope and unsafe supplement URLs',()=>{
 const {inputs,results}=require('../dist/curriculum-marketplace.contracts');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal(inputs.install.safeParse({packId:id,termsAccepted:true}).success,true);
 assert.equal(inputs.install.safeParse({packId:id,termsAccepted:false}).success,false);
 assert.equal(inputs.install.safeParse({packId:id,termsAccepted:true,licenseCode:'COMMERCIAL'}).success,false);
 assert.equal(inputs.rollover.safeParse({versionId:id,now:'2027-01-01'}).success,false);
 assert.equal(inputs.rollover.safeParse({versionId:id,academicYearId:id}).success,false);
 const supplement={courseVersionId:id,scope:'program',title:'Learning resource',kind:'link',url:'https://example.org/resource'};
 assert.equal(inputs.supplement.safeParse(supplement).success,true);
 for(const url of ['http://example.org','https://user:password@example.org','javascript:alert(1)'])
  assert.equal(inputs.supplement.safeParse({...supplement,url}).success,false);
 assert.equal(results.eligibility.safeParse({eligible:false,reason:'no_year_adoption'}).success,true);
 assert.equal(results.eligibility.safeParse({eligible:true,reason:'invalid_or_expired',versionId:id}).success,false);
 assert.equal(results.eligibility.safeParse({eligible:true,reason:'active',versionId:id,activationEligible:true}).success,false);
});

test('Instructional Track routes expose governed authoring, review, publication and withdrawal',async()=>{
 const {app,document}=await createApi(readConfig({API_DOCS:'0'}));
 const id='00000000-0000-4000-8000-000000000001';
 try{
  await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  const base='/api/v1/instructional-track-versions/{trackVersionId}/';
  const routes=[['/api/v1/course-versions/{courseVersionId}/instructional-track-drafts','POST'],...['revisions','submissions','reviews','publication','withdrawals'].map(s=>[base+s,'POST']),[base+'draft','GET'],[base+'review','GET']];
  for(const [path,method] of routes){
   const op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 }finally{await app.close();}
});
test('Instructional Track contracts reject private answer keys, authority injection and missing revision',()=>{
 const {inputs,results}=require('../dist/instructional-track-authoring.contracts');
 const id='00000000-0000-4000-8000-000000000001',expectedRevision='a'.repeat(64);
 const review={requestId:id,expectedRevision,reviewKind:'rights',decision:'approved',rationale:'Current license reviewed',evidenceVersionId:id};
 assert.equal(inputs.review.safeParse(review).success,true);
 assert.equal(inputs.review.safeParse({...review,reviewerPersonId:id}).success,false);
 assert.equal(inputs.review.safeParse({...review,expectedRevision:undefined}).success,false);
 assert.equal(inputs.release.safeParse({requestId:id,expectedRevision,manifestApproved:true}).success,false);
 const material={courseUnitId:id,assetVersionId:null,materialKind:'practice',activitySpec:{prompt:'Explain the concept'}};
 const save={requestId:id,expectedRevision,materials:[material],presentations:[]};
 assert.equal(inputs.save.safeParse(save).success,true);
 assert.equal(inputs.save.safeParse({...save,materials:[{...material,activitySpec:{nested:[{correct_answer:'private'}]}}]}).success,false);
 assert.equal(inputs.save.safeParse({...save,presentations:[{courseLessonId:id,assetVersionId:id,presentationKind:'primary',ordinal:1,accessibilityNotes:{solution:'private'}}]}).success,false);
 assert.equal(results.published.safeParse({trackVersionId:id,manifestHash:expectedRevision,lifecycle:'published',studentAccessGranted:true}).success,false);
});

test('Instructional Track reviewer snapshot is diagnostic and excludes storage and authority fields',()=>{
 const {reviewSnapshot}=require('../dist/instructional-track-authoring.contracts');
 const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
 const snapshot={trackVersionId:id,courseVersionId:id,trackTitle:'Track',trackKind:'primary',courseTitle:'Course',manifestId:id,manifestHash:hash,manifestStatus:'draft',lifecycle:'draft',
 items:[{assetVersionId:id,usageKind:'required_instruction',contentHash:hash,rightsEvidenceVersionId:id}],
 lessons:[],presentations:[],reviews:['academic','rights','accessibility','coverage','safeguarding'].map(reviewKind=>({reviewKind,decision:null,rationale:null,evidenceVersionId:null,decidedAt:null})),publicationAuthorityVerified:false};
 assert.equal(reviewSnapshot.safeParse(snapshot).success,true);
 assert.equal(reviewSnapshot.safeParse({...snapshot,publicationAuthorityVerified:true}).success,false);
 assert.equal(reviewSnapshot.safeParse({...snapshot,items:[{...snapshot.items[0],storageReference:'private'}]}).success,false);
});

test('Curriculum publisher routes retain protected compatibility contracts',async()=>{
 const {app,document}=await createApi(readConfig({API_DOCS:'0'}));
 const id='00000000-0000-4000-8000-000000000001';
 try{
  await app.listen(0,'127.0.0.1');const url=await app.getUrl();
  const base='/api/v1/programs/{programId}/',version=base+'curriculum-versions/{versionId}/';
  for(const [path,method] of [
   ['/api/v1/curriculum-publisher-programs','GET'],[base+'curriculum-studio','GET'],
   [base+'curriculum-courses','POST'],[base+'curriculum-courses/{courseId}/drafts','POST'],
   [version+'revisions','POST'],[version+'modules/{moduleId}/lessons/{lessonId}/revisions','POST'],[version+'publication','POST']
  ]){
   const op=document.paths[path][method.toLowerCase()];
   assert.ok(op.security);assert.ok(op.responses['403']);assert.ok(op.responses['409']);
   const response=await fetch(url+path.replace(/\{[^}]+\}/g,id),method==='POST'?{method,headers:{Origin:url,'content-type':'application/json'},body:'{}'}:undefined);
   assert.equal(response.status,method==='POST'?503:401);
  }
 }finally{await app.close();}
});
test('Curriculum input contracts separate learner content, teacher guides and authority',()=>{
 const {inputs,params,results}=require('../dist/curriculum-authoring.contracts');
 const id='00000000-0000-4000-8000-000000000001',expectedRevision='a'.repeat(64);
 const lesson={id:'lesson-1',title:'Introduction',body:'Lesson body',resources:[]};
 const content={version:1,syllabus:'Course outline',modules:[{id:'module-1',title:'Module',lessons:[lesson]}],resources:[]};
 const save={expectedRevision,content};
 assert.equal(inputs.save.safeParse(save).success,true);
 assert.equal(inputs.save.safeParse({...save,teacherGuides:null}).success,true);
 assert.equal(inputs.save.safeParse({...save,content:{...content,teacherGuides:{}}}).success,false);
 assert.equal(inputs.lesson.safeParse({expectedRevision,lesson:{...lesson,answerKey:'private'}}).success,false);
 assert.equal(inputs.lesson.safeParse({expectedRevision,lesson:{...lesson,resources:[{id:'r',title:'Resource',url:'https://example.org',documentId:id}]}}).success,false);
 assert.equal(inputs.lesson.safeParse({expectedRevision,lesson:{...lesson,resources:[{id:'r',title:'Resource',url:'https://user:pass@example.org'}]}}).success,false);
 assert.equal(inputs.publish.safeParse({expectedRevision,confirmed:false,reason:'Review completed'}).success,false);
 assert.equal(inputs.publish.safeParse({expectedRevision,confirmed:true,reason:'Review completed',reviewerPersonId:id}).success,false);
 assert.equal(params.lesson.safeParse({programId:id,versionId:id,moduleId:'module-1',lessonId:'lesson-1'}).success,true);
 assert.equal(params.lesson.safeParse({programId:id,versionId:id,moduleId:'module/1',lessonId:'lesson-1'}).success,false);
 assert.equal(results.version.safeParse({versionId:id,nativeOfferingPublished:true}).success,false);
});
