import {test,expect,type Browser,type BrowserContext,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
import {pilotRpcPage,pilotRpc as rpc,expectPilotDenial as deny} from "../helpers/pilot-governed-rpc";

const uuid=z.string().uuid();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&(v.endsWith(".test")||v.endsWith(".demo"))),
  grantId:uuid,organizationId:uuid,privateAccessCode:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional()}).strict()
  .refine(a=>a.email.endsWith(".demo")===Boolean(a.privateAccessCode),"Use ordinary email-link QA or the existing individual synthetic credential");
const meeting=z.object({requestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,agendaRequestId:uuid}).strict();
const metric=z.object({metricKey:z.enum(["class.registrations","class.uniquePeople","noncredit.registrations","noncredit.distinctLearners"]),definitionVersion:z.string().min(1).max(64)}).strict();
const siteScope=z.object({host:actor,classId:uuid,siteId:uuid,meetings:z.array(meeting).length(4)}).strict();
const learner=z.object({actor,courseAttemptId:uuid,paired:z.boolean(),present:z.boolean().optional()}).strict();
const manifest=z.object({offeringVersionId:uuid,manifestId:uuid,expectedHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const releaseAsset=z.object({assetVersionId:uuid,usageKind:z.enum(["required_instruction","supporting","accessibility","assessment"])}).strict();
const releasePolicy=z.object({courseVersionId:uuid,minimumApprovedPrimaryTracks:z.number().int().min(1).max(10),
  completeLessonCoverageRequired:z.literal(true),independentAcademicReviewRequired:z.literal(true),
  rightsClearanceRequired:z.literal(true),accessibilityReviewRequired:z.literal(true)}).strict();
const reviewKind=z.enum(["academic","rights","accessibility","coverage","safety"]);
const reviewDecision=z.object({reviewKind,decision:z.enum(["approved","rejected"]),
  evidenceVersionId:uuid.nullable(),rationale:z.string().trim().min(10).max(2000)}).strict()
  .refine(d=>d.decision!=="approved"||d.evidenceVersionId!==null,"Approval requires independently verified evidence");
const reportSite=z.object({manager:actor,classId:uuid,siteId:uuid,
  sessionIds:z.array(uuid).length(4),expectedDistinctPeople:z.number().int().min(2).max(20),
  expectedPresentOccurrences:z.number().int().min(1).max(80)}).strict();
const cohortSite=z.object({classId:uuid,siteId:uuid,ownerOrganizationId:uuid,classOfferingVersionId:uuid,
  creditMode:z.enum(["for_credit","audit","not_applicable"]),learners:z.array(actor).min(2).max(20)}).strict();
const lessonInstruction=z.object({lessonId:uuid,assetVersionId:uuid,prompt:z.string().trim().min(5).max(1000),
  choices:z.array(z.string().trim().min(1).max(200)).min(2).max(8)}).strict();
const scenario=z.discriminatedUnion("stage",[
  z.object({stage:z.literal("place-deployment"),operator:actor,foreign:actor,deploymentId:uuid,siteId:uuid}).strict(),
  z.object({stage:z.literal("prepare-blueprint"),author:actor,siteId:uuid,
    configurationId:uuid,initialVersionId:uuid,blueprintId:uuid,blueprintVersionId:uuid,
    name:z.string().min(2).max(120),version:z.record(z.unknown())}).strict(),
  z.object({stage:z.literal("review-blueprint"),reviewer:actor,author:actor,
    configurationVersionId:uuid,reviewId:uuid,evidenceVersionId:uuid,
    rationale:z.string().trim().min(10).max(4000),
    components:z.array(z.object({componentId:uuid,decision:z.literal("approved"),evidenceVersionId:uuid,
      conditions:z.string().max(2000).nullable()}).strict()).max(200)}).strict(),
  z.object({stage:z.literal("execute-blueprint"),executor:actor,siteId:uuid,
    configurationVersionId:uuid,reviewId:uuid,operationId:uuid,
    idempotencyKey:z.string().min(8).max(200),expectedOfferingVersionIds:z.array(uuid).min(1).max(50)}).strict(),
  z.object({stage:z.literal("approve-adoption"),reviewer:actor,deploymentId:uuid,offeringVersionId:uuid,
    evidenceVersionId:uuid,rationale:z.string().trim().min(10).max(2000)}).strict(),
  z.object({stage:z.literal("prepare-class"),operator:actor,siteId:uuid,offeringVersionId:uuid,
    courseVersionId:uuid,deploymentId:uuid,title:z.string().trim().min(3).max(200),
    deliveryMode:z.enum(["self_paced","facilitated"]),capacity:z.number().int().min(2).max(100),
    consentVersion:z.string().trim().min(3).max(80),consentText:z.string().trim().min(25).max(10000)}).strict(),
  z.object({stage:z.literal("publish-courses"),publisher:actor,offering:manifest}).strict(),
  z.object({stage:z.literal("enroll-cohort"),sites:z.array(cohortSite).length(2)}).strict(),
  z.object({stage:z.literal("review-release"),reviewer:actor,author:actor,offering:manifest,
    decisions:z.array(reviewDecision).min(1).max(5)}).strict(),
  z.object({stage:z.literal("cohort-report"),sites:z.array(reportSite).length(2),
    from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),
  z.object({stage:z.literal("configure-release"),reviewer:actor,offeringVersionId:uuid,
    expectedManuscriptHash:hash,expectedPolicyRevision:hash,requirements:z.array(releasePolicy).min(1).max(50),
    reviewEvidenceVersionId:uuid,rationale:z.string().min(10).max(2000)}).strict(),
  z.object({stage:z.literal("submit-release"),author:actor,offeringVersionId:uuid,
    expectedManuscriptHash:hash,assets:z.array(releaseAsset).max(50)}).strict(),
  z.object({stage:z.literal("publish"),publisher:actor,offering:manifest}).strict(),
  z.object({stage:z.literal("enroll"),learner:actor,classId:uuid,siteId:uuid,ownerOrganizationId:uuid,classOfferingVersionId:uuid,creditMode:z.enum(["for_credit","audit","not_applicable"])}).strict(),
  z.object({stage:z.literal("schedule"),sites:z.array(siteScope).length(2)}).strict(),
  z.object({stage:z.literal("deliver"),host:actor,classId:uuid,siteId:uuid,classSessionId:uuid,
    learners:z.array(learner).min(2).max(20),foreign:learner,instruction:lessonInstruction.optional()}).strict(),
  z.object({stage:z.literal("relationships"),owner:actor,recipient:actor,foreign:actor,siteId:uuid,metrics:z.array(metric).min(1).max(4)}).strict()
]).parse(JSON.parse(process.env.CAN_PILOT_QA_GOVERNED_JSON??"{}"));
const sql=neon(process.env.TEST_DATABASE_URL!);
const branch="br-solitary-art-arun91gj";
type Actor=z.infer<typeof actor>;
async function authorizeFixture(a:Actor){
  const [row]=await sql`SELECT count(*)::int AS count FROM public.access_accounts ac
    JOIN public.people p ON p.id=ac.person_id
    JOIN public.organizations o ON o.id=${a.organizationId}::uuid
    WHERE ac.email_normalized=${a.email} AND NOT ac.disabled AND p.active
      AND ((${a.email.endsWith(".test")} AND ac.email_verified_at IS NOT NULL)
        OR (${a.email.endsWith(".demo")} AND o.domain LIKE '%.demo' AND ac.private_access_code_hash IS NOT NULL))
      AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}`;
  expect(row?.count).toBe(1);
}
async function openActor(browser:Browser,a:Actor,contexts:BrowserContext[],learner=false):Promise<Page>{
  await authorizeFixture(a);
  const context=await browser.newContext();contexts.push(context);
  if(a.privateAccessCode){
    // Standard individual synthetic credential, never the shared fixed code.
    // No credential issuance or permission changes occur in the test.
    const response=await context.request.post("http://localhost:5183/access/verify",
      {headers:{Origin:"http://localhost:5183"},data:{email:a.email,code:a.privateAccessCode}});
    if(!response.ok())throw Error("Existing individual synthetic credential was rejected");
  }
  const initial=a.privateAccessCode?await qaSession(context):await authenticateQaActor(context,a.email);
  const grant=initial.grants.find(g=>g.id===a.grantId);
  if(!grant||!(grant.organizationId===a.organizationId||
     learner&&grant.role==="account_holder"&&grant.organizationId===null&&!a.privateAccessCode))
    throw Error("Exact authorized QA membership required");
  if(initial.activeGrantId!==a.grantId){
    const switched=await context.request.post("http://localhost:5183/access/session",{headers:{Origin:"http://localhost:5183"},data:{grantId:a.grantId}});
    expect(switched.ok()).toBe(true);
  }
  expect((await qaSession(context)).activeGrantId).toBe(a.grantId);
  const page=await pilotRpcPage(context);
  if(learner&&grant.role==="account_holder"){
    // Use the normal reviewed adult identity bridge. Do not retry activation
    // after a consumed decision; resume the existing linked native identity.
    const [review]=await sql`SELECT r.consumed_at IS NOT NULL AS consumed
      FROM public.access_adult_learning_reviews r JOIN public.access_accounts ac ON ac.id=r.access_account_id
      WHERE ac.email_normalized=${a.email} AND r.access_person_id=${grant.personId}::uuid
      AND r.organization_id=${a.organizationId}::uuid AND r.status='approved'`;
    if(!review)throw Error("Current independently reviewed learner home required");
    if(!review.consumed)expect(await rpc(page,"onboarding","activateReviewedNativeClassLearner")).toMatchObject({ready:true});
    expect(await rpc(page,"recovery","resumeLinkedNativeClassLearner")).toMatchObject({ready:true});
  }
  return page;
}
async function classScope(classId:string,siteId:string,ownerId:string){
  const [row]=await sql`SELECT count(*)::int AS count FROM public.classes c
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
    JOIN public.organizations o ON o.id=c.operating_organization_id
    WHERE c.id=${classId}::uuid AND s.id=${siteId}::uuid AND o.id=${ownerId}::uuid
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch} AND c.state='active'`;
  expect(row?.count).toBe(1);
}
type EnrollmentTarget=Omit<z.infer<typeof cohortSite>,"learners">&{learner:Actor};
async function enrollOne(browser:Browser,contexts:BrowserContext[],selection:EnrollmentTarget){
  const {learner,classId,siteId,ownerOrganizationId,classOfferingVersionId,creditMode}=selection;
  await classScope(classId,siteId,ownerOrganizationId);
  const [target]=await sql`SELECT count(*)::int AS count FROM public.class_offering_versions
    WHERE id=${classOfferingVersionId}::uuid AND class_id=${classId}::uuid AND state='published'`;
  expect(target?.count).toBe(1);
  const page=await openActor(browser,learner,contexts,true);
  const counts=async()=> (await sql`SELECT
    (SELECT count(*)::int FROM public.noncredit_registrations n JOIN public.access_accounts a ON a.person_id=n.participant_person_id
      WHERE a.email_normalized=${learner.email}) AS registrations,
    (SELECT count(*)::int FROM public.class_enrollments e JOIN public.access_accounts a ON a.person_id=e.learner_person_id
      WHERE a.email_normalized=${learner.email} AND e.class_id=${classId}::uuid) AS enrollments`)[0];
  const before=await counts();expect(before?.enrollments).toBe(0);
  const input={classOfferingVersionId,creditMode,adultAttested:true,consentAccepted:true};
  const fresh=await rpc<{classEnrollmentId:string;courseAttemptId:string;alreadyEnrolled:boolean}>(page,"enrollment","enrollInNativeClass",input);
  expect(fresh.alreadyEnrolled).toBe(false);
  expect(await rpc(page,"enrollment","enrollInNativeClass",input)).toMatchObject({...fresh,alreadyEnrolled:true});
  const after=await counts();
  expect(after).toEqual({registrations:before?.registrations,enrollments:1});
  const [link]=await sql`SELECT a.class_enrollment_id::text AS enrollment,a.noncredit_registration_id::text AS registration
    FROM public.learner_course_attempts a JOIN public.class_enrollments e ON e.id=a.class_enrollment_id AND e.course_attempt_id=a.id
    WHERE a.id=${fresh.courseAttemptId}::uuid AND e.id=${fresh.classEnrollmentId}::uuid AND e.class_id=${classId}::uuid`;
  expect(link).toEqual({enrollment:fresh.classEnrollmentId,registration:null});
  return fresh;
}

test("governed pilot API stage",async({browser},info)=>{
  const contexts:BrowserContext[]=[];
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch});
  let evidence:Record<string,unknown>={stage:scenario.stage,revision:process.env.CAN_RELEASE_SOURCE_SHA};
  try{
    if(scenario.stage==="place-deployment"){
      const {operator,foreign,deploymentId,siteId}=scenario;
      expect(operator.organizationId).not.toBe(foreign.organizationId);
      const page=await openActor(browser,operator,contexts),outside=await openActor(browser,foreign,contexts);
      const input={deploymentId,siteId};
      await deny(outside,"deployment","placeNativeDeploymentSite",input);
      const before=await sql`SELECT d.status,a.approval_status FROM public.program_deployments d
        JOIN public.deployment_offering_adoptions a ON a.deployment_id=d.id WHERE d.id=${deploymentId}::uuid`;
      expect(before.length).toBeGreaterThan(0);
      expect(before.every(r=>["planning","review"].includes(r.status)&&r.approval_status==="proposed")).toBe(true);
      const placed=await rpc<{placementId:string;created:boolean}>(page,"deployment","placeNativeDeploymentSite",input);
      uuid.parse(placed.placementId);expect(placed.created).toBe(true);
      expect(await rpc(page,"deployment","placeNativeDeploymentSite",input)).toMatchObject({...input,placementId:placed.placementId,created:false});
      const rows=await sql`SELECT id::text FROM public.deployment_sites WHERE deployment_id=${deploymentId}::uuid
        AND site_id=${siteId}::uuid AND purpose='instruction'`;
      expect(rows).toEqual([{id:placed.placementId}]);
      const after=await sql`SELECT d.status,a.approval_status FROM public.program_deployments d
        JOIN public.deployment_offering_adoptions a ON a.deployment_id=d.id WHERE d.id=${deploymentId}::uuid`;
      expect(after).toEqual(before);
      evidence={...evidence,placementId:placed.placementId,deploymentId,siteId,placementCreated:true,adoptionApproved:false,deploymentActivated:false};
    }else if(scenario.stage==="prepare-blueprint"){
      const {author,siteId,configurationId,initialVersionId,blueprintId,blueprintVersionId,name,version}=scenario;
      const [site]=await sql`SELECT count(*)::int AS count FROM public.sites WHERE id=${siteId}::uuid AND organization_id=${author.organizationId}::uuid`;
      expect(site?.count).toBe(1);
      expect(version.config).toMatchObject({siteId});
      const page=await openActor(browser,author,contexts);
      const home=await rpc<{organizationId:string;siteIds:string[]}>(page,"blueprint","readCanonicalBlueprintHome");
      expect(home.organizationId).toBe(author.organizationId);expect(home.siteIds).toContain(siteId);
      const input={configurationId,initialVersionId,blueprintId,blueprintVersionId,owningOrganizationId:author.organizationId,name,version};
      const target={configurationId,versionId:initialVersionId,revision:1};
      expect(await rpc(page,"blueprint","createCanonicalBlueprintConfiguration",input)).toMatchObject({...target,lifecycle:"draft"});
      expect(await rpc(page,"blueprint","createCanonicalBlueprintConfiguration",input)).toMatchObject({...target,lifecycle:"draft"});
      const submit={configurationId,expectedRevision:1};
      expect(await rpc(page,"blueprint","submitCanonicalBlueprintConfiguration",submit)).toMatchObject({...target,lifecycle:"frozen"});
      expect(await rpc(page,"blueprint","submitCanonicalBlueprintConfiguration",submit)).toMatchObject({...target,lifecycle:"frozen"});
      const current=await rpc(page,"blueprint","readCanonicalBlueprintConfiguration",{configurationId});
      expect(current).toMatchObject({...target,lifecycle:"frozen",blueprintVersionId,config:{siteId}});
      const [stored]=await sql`SELECT v.lifecycle,v.revision,c.owning_organization_id::text AS organization
        FROM public.blueprint_configuration_versions v JOIN public.blueprint_configurations c ON c.id=v.configuration_id
        WHERE v.id=${initialVersionId}::uuid AND c.id=${configurationId}::uuid`;
      expect(stored).toEqual({lifecycle:"frozen",revision:1,organization:author.organizationId});
      evidence={...evidence,configurationId,configurationVersionId:initialVersionId,submitted:true,approved:false};
    }else if(scenario.stage==="review-blueprint"){
      const {reviewer,author,configurationVersionId,reviewId,evidenceVersionId,rationale,components}=scenario;
      expect(author.organizationId).toBe(reviewer.organizationId);expect(author.email).not.toBe(reviewer.email);
      const [owned]=await sql`SELECT count(*)::int AS count FROM public.blueprint_configuration_versions v
        JOIN public.blueprint_configurations c ON c.id=v.configuration_id WHERE v.id=${configurationVersionId}::uuid
        AND v.lifecycle='frozen' AND c.owning_organization_id=${reviewer.organizationId}::uuid`;
      expect(owned?.count).toBe(1);
      const authorPage=await openActor(browser,author,contexts),reviewPage=await openActor(browser,reviewer,contexts);
      const decision={configurationVersionId,reviewId,evidenceVersionId,rationale,components,decision:"approved"};
      await deny(authorPage,"blueprint","decideCanonicalBlueprintReview",decision);
      const inspection=await rpc<{configurationVersionId:string;lifecycle:string;components:{componentId:string}[]}>(reviewPage,"blueprint","readCanonicalBlueprintReview",{configurationVersionId});
      expect(inspection.lifecycle).toBe("frozen");
      expect(inspection.components.map(c=>c.componentId).sort()).toEqual(components.map(c=>c.componentId).sort());
      expect(await rpc(reviewPage,"blueprint","decideCanonicalBlueprintReview",decision)).toMatchObject({reviewId,configurationVersionId,decision:"approved",created:true});
      expect(await rpc(reviewPage,"blueprint","decideCanonicalBlueprintReview",decision)).toMatchObject({reviewId,created:false});
      await deny(reviewPage,"blueprint","decideCanonicalBlueprintReview",{...decision,rationale:rationale==="Different review rationale"?"Another review rationale":"Different review rationale"},["CONFLICT"]);
      const [proof]=await sql`SELECT count(*)::int AS count FROM public.configuration_reviews r JOIN public.access_accounts a ON a.person_id=r.reviewer_person_id
        WHERE r.id=${reviewId}::uuid AND r.configuration_version_id=${configurationVersionId}::uuid
        AND r.decision='approved' AND r.evidence_version_id=${evidenceVersionId}::uuid AND a.email_normalized=${reviewer.email}`;
      expect(proof?.count).toBe(1);
      evidence={...evidence,configurationVersionId,reviewId,approved:true,componentsReviewed:components.length};
    }else if(scenario.stage==="execute-blueprint"){
      const {executor,siteId,configurationVersionId,reviewId,operationId,idempotencyKey,expectedOfferingVersionIds}=scenario;
      const [owned]=await sql`SELECT count(*)::int AS count FROM public.blueprint_configuration_versions v JOIN public.blueprint_configurations c ON c.id=v.configuration_id
        JOIN public.sites s ON s.id=${siteId}::uuid AND s.organization_id=c.owning_organization_id
        WHERE v.id=${configurationVersionId}::uuid AND v.config->>'siteId'=${siteId} AND v.lifecycle='frozen'
        AND c.owning_organization_id=${executor.organizationId}::uuid`;
      expect(owned?.count).toBe(1);
      const intents=await sql`SELECT offering_version_id::text AS id FROM public.blueprint_configuration_offering_intents WHERE configuration_version_id=${configurationVersionId}::uuid`;
      expect(intents.map(i=>i.id).sort()).toEqual([...expectedOfferingVersionIds].sort());
      const page=await openActor(browser,executor,contexts);
      const input={configurationVersionId,reviewId,operationId,idempotencyKey};
      const result=await rpc<{executionBatchId:string;deploymentIds:string[];created:boolean}>(page,"blueprint","executeCanonicalBlueprintConfiguration",input);
      uuid.parse(result.executionBatchId);expect(result.deploymentIds).toHaveLength(expectedOfferingVersionIds.length);
      const retry=await rpc<typeof result>(page,"blueprint","executeCanonicalBlueprintConfiguration",input);
      expect(retry).toMatchObject({executionBatchId:result.executionBatchId,created:false});
      expect([...retry.deploymentIds].sort()).toEqual([...result.deploymentIds].sort());
      const persisted=await sql`SELECT d.id::text AS deployment_id,d.status,a.id::text AS adoption_id,a.offering_version_id::text AS offering_version_id,a.approval_status
        FROM public.blueprint_outputs o JOIN public.blueprint_execution_batches b ON b.id=o.execution_batch_id
        JOIN public.program_deployments d ON d.id=o.deployment_id JOIN public.deployment_offering_adoptions a ON a.deployment_id=d.id
        WHERE b.id=${result.executionBatchId}::uuid AND b.configuration_version_id=${configurationVersionId}::uuid
        AND b.review_id=${reviewId}::uuid AND b.executing_organization_id=${executor.organizationId}::uuid
        AND b.execution_status='executed' AND d.operation_id=${operationId}::uuid`;
      expect(persisted.map(r=>r.deployment_id).sort()).toEqual([...result.deploymentIds].sort());
      expect(persisted.map(r=>r.offering_version_id).sort()).toEqual([...expectedOfferingVersionIds].sort());
      if(result.created)expect(persisted.every(r=>r.status==="planning"&&r.approval_status==="proposed")).toBe(true);
      evidence={...evidence,executionBatchId:result.executionBatchId,deployments:persisted,operationActivated:false};
    }else if(scenario.stage==="approve-adoption"){
      const {reviewer,deploymentId,offeringVersionId,evidenceVersionId,rationale}=scenario;
      const page=await openActor(browser,reviewer,contexts);
      const queue=await rpc<{limited:boolean;items:{adoptionId:string;deploymentId:string;offeringVersionId:string;blueprintExecutionRecorded:boolean;readiness:{recordedReady:boolean}[]}[]}>(page,"adoption","getNativeOfferingAdoptionReviewQueue");
      expect(queue.limited).toBe(false);
      const matches=queue.items.filter(r=>r.deploymentId===deploymentId&&r.offeringVersionId===offeringVersionId);
      expect(matches).toHaveLength(1);const target=matches[0]!;
      expect(target.blueprintExecutionRecorded).toBe(true);
      expect(target.readiness.length).toBeGreaterThan(0);
      expect(target.readiness.every(r=>r.recordedReady)).toBe(true);
      const result=await rpc(page,"adoption","approveNativeOfferingAdoption",{adoptionId:target.adoptionId,evidenceVersionId,rationale});
      expect(result).toMatchObject({adoptionId:target.adoptionId,approvalStatus:"approved"});
      const [stored]=await sql`SELECT a.approval_status,d.status FROM public.deployment_offering_adoptions a
        JOIN public.program_deployments d ON d.id=a.deployment_id JOIN public.access_accounts ac ON ac.person_id=a.approved_by_person_id
        WHERE a.id=${target.adoptionId}::uuid AND a.offering_version_id=${offeringVersionId}::uuid
        AND d.id=${deploymentId}::uuid AND ac.email_normalized=${reviewer.email}`;
      expect(stored?.approval_status).toBe("approved");
      evidence={...evidence,adoptionId:target.adoptionId,deploymentId,adoptionApproved:true,deploymentStatus:stored?.status};
    }else if(scenario.stage==="prepare-class"){
      const {operator,siteId,offeringVersionId,courseVersionId,deploymentId,title,deliveryMode,capacity,consentVersion,consentText}=scenario;
      const page=await openActor(browser,operator,contexts);
      // Discover the authorized adoption via the exact same API used by the
      // Class authoring UI; no SQL-generated or inferred adoption is accepted.
      const options=await rpc<{items:{deploymentId:string;adoptionId:string;offeringVersionId:string;courseVersionId:string;
        operatingOrganizationId:string;siteOptions:{id:string;allowedDeliveryModes:string[]}[]}[];nextCursor:number|null}>(
          page,"classes","getUnifiedClassCourseOptions",{search:"",cursor:0,siteId,offeringVersionId,courseVersionIds:[courseVersionId]});
      const matches=options.items.filter(o=>o.deploymentId===deploymentId&&o.offeringVersionId===offeringVersionId&&
        o.courseVersionId===courseVersionId&&o.operatingOrganizationId===operator.organizationId&&
        o.siteOptions.some(s=>s.id===siteId&&s.allowedDeliveryModes.includes(deliveryMode)));
      expect(matches).toHaveLength(1);
      expect(options.nextCursor).toBeNull();
      const definition={deploymentId,adoptionId:matches[0]!.adoptionId,offeringVersionId,courseVersionId,
        operatingOrganizationId:operator.organizationId,siteId,title,deliveryMode,capacity};
      const terms={visibility:"unlisted",enrollmentMethods:["self"],opensAt:null,closesAt:null,capacity,
        allowedCreditModes:["not_applicable"],consentVersion,consentText};
      const [existing]=await sql`SELECT count(*)::int AS count FROM public.classes WHERE operating_organization_id=${operator.organizationId}::uuid
        AND site_id=${siteId}::uuid AND title=${title}`;
      expect(existing?.count).toBe(0); // Fresh Class; ambiguous retries must be reconciled.
      const created=await rpc<{classId:string;classOfferingVersionId:string;status:string}>(page,"classes","createUnifiedClassDraft",{definition,terms});
      expect(created.status).toBe("draft");uuid.parse(created.classId);uuid.parse(created.classOfferingVersionId);
      expect(await rpc(page,"classes","activateUnifiedClass",{classId:created.classId})).toMatchObject({classId:created.classId});
      const target={classId:created.classId,classOfferingVersionId:created.classOfferingVersionId};
      expect(await rpc(page,"classes","publishUnifiedClassOffering",target)).toMatchObject({...target,state:"published",alreadyPublished:false});
      expect(await rpc(page,"classes","publishUnifiedClassOffering",target)).toMatchObject({...target,state:"published",alreadyPublished:true});
      await classScope(created.classId,siteId,operator.organizationId);
      const [persisted]=await sql`SELECT v.state,c.adoption_id::text AS adoption FROM public.class_offering_versions v
        JOIN public.classes c ON c.id=v.class_id WHERE v.id=${created.classOfferingVersionId}::uuid AND c.id=${created.classId}::uuid`;
      expect(persisted).toEqual({state:"published",adoption:definition.adoptionId});
      evidence={...evidence,classId:created.classId,classOfferingVersionId:created.classOfferingVersionId,classesPublished:1};
    }else if(scenario.stage==="publish-courses"){
      const {publisher,offering}=scenario;
      const [owned]=await sql`SELECT count(*)::int AS count FROM public.offering_versions v JOIN public.offerings o ON o.id=v.offering_id
        WHERE v.id=${offering.offeringVersionId}::uuid AND o.publisher_organization_id=${publisher.organizationId}::uuid AND v.lifecycle='draft'`;
      expect(owned?.count).toBe(1);
      const page=await openActor(browser,publisher,contexts);
      await rpc(page,"release","publishNativeOfferingCourses",offering);
      const [published]=await sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE cv.lifecycle='published')::int AS published
        FROM public.offering_courses oc JOIN public.course_versions cv ON cv.id=oc.course_version_id WHERE oc.offering_version_id=${offering.offeringVersionId}::uuid`;
      expect(published?.total).toBeGreaterThan(0);expect(published?.published).toBe(published?.total);
      const [draft]=await sql`SELECT lifecycle FROM public.offering_versions WHERE id=${offering.offeringVersionId}::uuid`;
      expect(draft?.lifecycle).toBe("draft");
      evidence={...evidence,coursesPublished:published?.published,offeringPublished:false};
    }else if(scenario.stage==="review-release"){
      const {reviewer,author,offering,decisions}=scenario;
      expect(reviewer.organizationId).toBe(author.organizationId);
      expect(reviewer.email).not.toBe(author.email);
      expect(new Set(decisions.map(d=>d.reviewKind)).size).toBe(decisions.length);
      await authorizeFixture(author);
      const [submitted]=await sql`SELECT count(*)::int AS count FROM public.content_publication_manifests m
        JOIN public.offering_versions v ON v.id=m.offering_version_id
        JOIN public.offerings o ON o.id=v.offering_id
        JOIN public.access_accounts a ON a.person_id=m.created_by_person_id
        WHERE m.id=${offering.manifestId}::uuid AND v.id=${offering.offeringVersionId}::uuid
          AND m.manifest_hash=${offering.expectedHash} AND m.manifest_status='draft'
          AND v.lifecycle='draft' AND o.publisher_organization_id=${author.organizationId}::uuid
          AND a.email_normalized=${author.email}`;
      expect(submitted?.count).toBe(1);
      const authorPage=await openActor(browser,author,contexts);
      const reviewerPage=await openActor(browser,reviewer,contexts);
      await deny(authorPage,"release","getNativeOfferingReviewContent",offering);
      const content=await rpc<{reviewedManifestHash:string;offeringVersionId:string}>(
        reviewerPage,"release","getNativeOfferingReviewContent",offering);
      expect(content).toMatchObject({reviewedManifestHash:offering.expectedHash,offeringVersionId:offering.offeringVersionId});
      // The private manifest must contain actual independently made decisions
      // for this exact reviewed snapshot. Do not derive or invent approvals.
      for(const decision of decisions){
        const [prior]=await sql`SELECT decision,evidence_version_id::text AS evidence,
          (reviewer_person_id=(SELECT person_id FROM public.access_accounts WHERE email_normalized=${reviewer.email})) AS same_reviewer
          FROM public.content_manifest_review_decisions WHERE manifest_id=${offering.manifestId}::uuid
            AND review_kind=${decision.reviewKind} ORDER BY decision_order DESC LIMIT 1`;
        if(prior?.decision===decision.decision&&prior.evidence===decision.evidenceVersionId&&prior.same_reviewer)continue;
        expect(await rpc(reviewerPage,"release","decideNativeOfferingRelease",{...offering,...decision}))
          .toMatchObject({manifestId:offering.manifestId,reviewKind:decision.reviewKind,decision:decision.decision});
        const [current]=await sql`SELECT decision,evidence_version_id::text AS evidence,
          (reviewer_person_id=(SELECT person_id FROM public.access_accounts WHERE email_normalized=${reviewer.email})) AS same_reviewer
          FROM public.content_manifest_review_decisions WHERE manifest_id=${offering.manifestId}::uuid
            AND review_kind=${decision.reviewKind} ORDER BY decision_order DESC LIMIT 1`;
        expect(current).toEqual({decision:decision.decision,evidence:decision.evidenceVersionId,same_reviewer:true});
      }
      evidence={...evidence,reviewedKinds:decisions.length,approvedKinds:decisions.filter(d=>d.decision==="approved").length,
        offeringPublished:false};
    }else if(scenario.stage==="cohort-report"){
      const {sites,from,to}=scenario;
      expect(new Set(sites.map(s=>s.siteId)).size).toBe(2);
      expect(new Set(sites.map(s=>s.classId)).size).toBe(2);
      expect(new Set(sites.map(s=>s.manager.organizationId)).size).toBe(2);
      expect(new Set(sites.flatMap(s=>s.sessionIds)).size).toBe(8);
      const pages:Page[]=[];
      for(const site of sites){
        await classScope(site.classId,site.siteId,site.manager.organizationId);
        pages.push(await openActor(browser,site.manager,contexts));
      }
      const counts:{sessions:number;attendance:number;people:number}[]=[];
      for(const [i,site] of sites.entries()){
        const input={classId:site.classId,from,to};
        const page=pages[i]!,foreign=pages[1-i]!;
        await deny(foreign,"report","getNativeClassReport",input);
        const [persisted]=await sql`WITH rooms AS (
          SELECT cs.id,r.id AS room_id FROM public.class_sessions cs
          JOIN public.facilitated_classroom_plans p ON p.id=cs.classroom_plan_id
          JOIN public.facilitated_learning_sessions r ON r.id=p.facilitated_session_id
          JOIN public.delivery_sessions d ON d.id=cs.delivery_session_id
          WHERE cs.class_id=${site.classId}::uuid AND p.site_id=${site.siteId}::uuid
            AND r.site_id=${site.siteId}::uuid AND r.host_organization_id=${site.manager.organizationId}::uuid
            AND r.state='ended' AND r.ended_at IS NOT NULL
            AND cs.id=ANY(${site.sessionIds}::uuid[]) AND d.starts_at>=(${from}::date::timestamp AT TIME ZONE 'UTC') AND d.starts_at<(${to}::date::timestamp AT TIME ZONE 'UTC')
            AND d.starts_at<=now()
        ), latest AS (
          SELECT DISTINCT ON (a.facilitated_session_id,a.course_attempt_id)
            a.status,a.course_attempt_id,e.learner_person_id
          FROM public.facilitated_room_attendance_assertions a
          JOIN rooms r ON r.room_id=a.facilitated_session_id
          JOIN public.learner_course_attempts ca ON ca.id=a.course_attempt_id
          JOIN public.class_enrollments e ON e.id=ca.class_enrollment_id AND e.class_id=${site.classId}::uuid
          WHERE a.asserted_at<=now()
          ORDER BY a.facilitated_session_id,a.course_attempt_id,a.asserted_at DESC,a.id DESC
        ) SELECT (SELECT count(*)::int FROM rooms) AS sessions,
          (SELECT count(*)::int FROM latest WHERE status='present') AS attendance,
          (SELECT count(DISTINCT learner_person_id)::int FROM latest WHERE status='present') AS attendees,
          (SELECT count(DISTINCT learner_person_id)::int FROM public.class_enrollments
             WHERE class_id=${site.classId}::uuid AND enrolled_at>=(${from}::date::timestamp AT TIME ZONE 'UTC') AND enrolled_at<(${to}::date::timestamp AT TIME ZONE 'UTC')
             AND enrolled_at<=now()) AS people`;
        expect(persisted).toMatchObject({sessions:4,attendance:site.expectedPresentOccurrences,people:site.expectedDistinctPeople});
        const report=await rpc<{visibility:string;publicationApproved:boolean;metrics:Record<string,number|null>}>(
          page,"report","getNativeClassReport",input);
        expect(report).toMatchObject({visibility:"authorized_provider_private",publicationApproved:false});
        expect(report.metrics).toMatchObject({sessionsScheduled:4,sessionsDelivered:4,
          verifiedAttendance:persisted?.attendance,verifiedAttendees:persisted?.attendees,uniquePeople:persisted?.people});
        counts.push({sessions:Number(persisted?.sessions),attendance:Number(persisted?.attendance),people:Number(persisted?.people)});
      }
      // Deliberately no sum of Site-level unique people: a learner may attend
      // both Sites. These are provider-private acceptance counts, not HQ impact.
      evidence={...evidence,sites:2,endedSessions:counts.reduce((n,x)=>n+x.sessions,0),
        verifiedAttendanceOccurrences:counts.reduce((n,x)=>n+x.attendance,0),
        distinctPeopleBySite:counts.map(x=>x.people),crossSiteReportDenials:2,
        nationalOutcomesVerified:false};
    }else if(scenario.stage==="configure-release"||scenario.stage==="submit-release"){
      const {offeringVersionId,expectedManuscriptHash}=scenario;
      const acting=scenario.stage==="configure-release"?scenario.reviewer:scenario.author;
      const [owned]=await sql`SELECT count(*)::int AS count FROM public.offering_versions v
        JOIN public.offerings o ON o.id=v.offering_id
        JOIN public.organizations p ON p.id=o.publisher_organization_id
        WHERE v.id=${offeringVersionId}::uuid AND p.id=${acting.organizationId}::uuid
          AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
          AND v.lifecycle='draft'`;
      expect(owned?.count).toBe(1);
      const page=await openActor(browser,acting,contexts);
      if(scenario.stage==="configure-release"){
        // A previously reviewed, exact manuscript and policy revision are supplied
        // by the authorized reviewer. Never derive a new approval from a changed draft.
        const view=await rpc<{manuscriptHash:string;revision:string;courses:{courseVersionId:string}[]}>(
          page,"release","getNativeOfferingReleasePolicyReview",{offeringVersionId});
        expect(view.manuscriptHash).toBe(expectedManuscriptHash);
        expect(view.revision).toBe(scenario.expectedPolicyRevision);
        expect(scenario.requirements.map(p=>p.courseVersionId).sort()).toEqual(view.courses.map(c=>c.courseVersionId).sort());
        const result=await rpc<{offeringVersionId:string;policyRevision:string}>(
          page,"release","saveNativeOfferingReleasePolicy",{
            offeringVersionId,expectedManuscriptHash,expectedPolicyRevision:scenario.expectedPolicyRevision,
            requirements:scenario.requirements,reviewEvidenceVersionId:scenario.reviewEvidenceVersionId,
            rationale:scenario.rationale});
        expect(result.offeringVersionId).toBe(offeringVersionId);
        const updated=await rpc<{revision:string;policies:unknown[]}>(
          page,"release","getNativeOfferingReleasePolicyReview",{offeringVersionId});
        expect(updated.revision).toBe(result.policyRevision);
        expect(updated.policies).toEqual(expect.arrayContaining(scenario.requirements));
        evidence={...evidence,configuredCourses:scenario.requirements.length,policyReviewed:true,offeringPublished:false};
      }else{
        const view=await rpc<{lifecycle:string;manuscriptHash:string}>(
          page,"release","getNativeOfferingReleaseOverview",{offeringVersionId});
        expect(view.lifecycle).toBe("draft");
        expect(view.manuscriptHash).toBe(expectedManuscriptHash);
        const input={offeringVersionId,expectedHash:expectedManuscriptHash,assets:scenario.assets};
        const submitted=await rpc<{manifestId:string;manifestHash:string;created:boolean}>(
          page,"release","submitNativeOfferingRelease",input);
        uuid.parse(submitted.manifestId);hash.parse(submitted.manifestHash);
        expect(await rpc(page,"release","submitNativeOfferingRelease",input)).toMatchObject({
          manifestId:submitted.manifestId,manifestHash:submitted.manifestHash,created:false});
        const [persisted]=await sql`SELECT m.manifest_hash AS hash,v.lifecycle,
          (SELECT count(*)::int FROM public.content_publication_manifest_items i WHERE i.manifest_id=m.id) AS assets
          FROM public.content_publication_manifests m JOIN public.offering_versions v ON v.id=m.offering_version_id
          WHERE m.id=${submitted.manifestId}::uuid AND v.id=${offeringVersionId}::uuid`;
        expect(persisted).toEqual({hash:submitted.manifestHash,lifecycle:"draft",assets:scenario.assets.length});
        evidence={...evidence,manifestId:submitted.manifestId,manifestHash:submitted.manifestHash,
          submittedAssetUses:scenario.assets.length,offeringPublished:false};
      }
    }else if(scenario.stage==="publish"){
      const {publisher,offering}=scenario;
      const [row]=await sql`SELECT count(*)::int AS count FROM public.offering_versions v
        JOIN public.offerings o ON o.id=v.offering_id
        WHERE v.id=${offering.offeringVersionId}::uuid AND o.publisher_organization_id=${publisher.organizationId}::uuid
          AND v.lifecycle='draft'`;
      expect(row?.count).toBe(1);
      const page=await openActor(browser,publisher,contexts);
      // These commands consume existing independently reviewed evidence.
      // Never issue synthetic approvals for unreviewed content.
      await rpc(page,"release","publishNativeOfferingCourses",offering);
      await rpc(page,"release","approveNativeOfferingAssetManifest",offering);
      expect(await rpc(page,"release","publishNativeOfferingVersion",offering)).toMatchObject({offeringVersionId:offering.offeringVersionId});
      const [published]=await sql`SELECT lifecycle FROM public.offering_versions WHERE id=${offering.offeringVersionId}::uuid`;
      expect(published?.lifecycle).toBe("published");
      evidence={...evidence,offeringsPublished:1};
    }else if(scenario.stage==="enroll"){
      await enrollOne(browser,contexts,scenario);
      evidence={...evidence,newClassEnrollments:1,newNoncreditRegistrations:0};
    }else if(scenario.stage==="enroll-cohort"){
      const {sites}=scenario;
      expect(new Set(sites.map(s=>s.siteId)).size).toBe(2);
      expect(new Set(sites.map(s=>s.ownerOrganizationId)).size).toBe(2);
      expect(new Set(sites.map(s=>s.classId)).size).toBe(2);
      const roster=sites.flatMap(s=>s.learners);
      expect(new Set(roster.map(l=>l.email)).size).toBe(roster.length);
      // Preflight all actor and target boundaries before enrollment writes.
      for(const site of sites){
        await classScope(site.classId,site.siteId,site.ownerOrganizationId);
        const [published]=await sql`SELECT count(*)::int AS count FROM public.class_offering_versions
          WHERE id=${site.classOfferingVersionId}::uuid AND class_id=${site.classId}::uuid AND state='published'`;
        expect(published?.count).toBe(1);
        for(const learner of site.learners)await authorizeFixture(learner);
      }
      const attempts=new Set<string>(),enrollments=new Set<string>();
      for(const site of sites){
        for(const learner of site.learners){
          const result=await enrollOne(browser,contexts,{...site,learner});
          attempts.add(result.courseAttemptId);enrollments.add(result.classEnrollmentId);
        }
      }
      expect(attempts.size).toBe(roster.length);expect(enrollments.size).toBe(roster.length);
      evidence={...evidence,sites:2,newClassEnrollments:enrollments.size,newNoncreditRegistrations:0,
        distinctCourseAttempts:attempts.size,learnersBySite:sites.map(site=>site.learners.length)};
    }else if(scenario.stage==="schedule"){
      expect(new Set(scenario.sites.map(s=>s.siteId)).size).toBe(2);
      expect(new Set(scenario.sites.map(s=>s.host.organizationId)).size).toBe(2);
      expect(new Set(scenario.sites.flatMap(s=>s.meetings.map(m=>m.requestId))).size).toBe(8);
      for(const site of scenario.sites){
        await classScope(site.classId,site.siteId,site.host.organizationId);
        const page=await openActor(browser,site.host,contexts);
        const input={classId:site.classId,cadence:"custom",meetings:site.meetings.map(({requestId,startsAt,endsAt})=>({requestId,startsAt,endsAt}))};
        const result=await rpc<{sessions:{classSessionId:string;duplicate:boolean}[]}>(page,"session","scheduleNativeClassSessions",input);
        expect(result.sessions).toHaveLength(4);
        const repeat=await rpc<typeof result>(page,"session","scheduleNativeClassSessions",input);
        expect(repeat.sessions.map(s=>s.classSessionId)).toEqual(result.sessions.map(s=>s.classSessionId));
        expect(repeat.sessions.every(s=>s.duplicate)).toBe(true);
        for(const [i,session] of result.sessions.entries()){
          const m=site.meetings[i]!;
          expect(await rpc(page,"agenda","publishNativeClassSessionAgenda",{
            classId:site.classId,classSessionId:session.classSessionId,requestId:m.agendaRequestId,expectedRevisionNo:0,
            items:[{kind:"watch",referenceId:m.lessonId}]})).toMatchObject({classSessionId:session.classSessionId});
        }
        const [counts]=await sql`SELECT count(*)::int AS count FROM public.class_sessions
          WHERE class_id=${site.classId}::uuid AND request_id=ANY(${input.meetings.map(m=>m.requestId)}::uuid[])`;
        expect(counts?.count).toBe(4);
      }
      evidence={...evidence,sites:2,scheduledSessions:8,deliveryVerified:false};
    }else if(scenario.stage==="deliver"){
      const {host,classId,siteId,classSessionId,learners,foreign,instruction}=scenario;
      await classScope(classId,siteId,host.organizationId);
      expect(new Set(learners.map(l=>l.courseAttemptId)).size).toBe(learners.length);
      expect(learners.some(l=>l.paired)).toBe(true);expect(learners.some(l=>!l.paired)).toBe(true);
      expect(learners.some(l=>l.courseAttemptId===foreign.courseAttemptId)).toBe(false);
      const [session]=await sql`SELECT count(*)::int AS count FROM public.class_sessions
        WHERE id=${classSessionId}::uuid AND class_id=${classId}::uuid`;
      expect(session?.count).toBe(1);
      for(const l of learners){
        await authorizeFixture(l.actor);
        const [enrollment]=await sql`SELECT count(*)::int AS count FROM public.class_enrollments e
          JOIN public.access_accounts a ON a.person_id=e.learner_person_id
          WHERE e.class_id=${classId}::uuid AND e.course_attempt_id=${l.courseAttemptId}::uuid AND e.status='active'
          AND a.email_normalized=${l.actor.email}`;
        expect(enrollment?.count).toBe(1);
      }
      const page=await openActor(browser,host,contexts);
      const room=await rpc<{facilitatedSessionId:string;pairingCode:string|null}>(page,"session","openNativeClassSession",{classId,classSessionId});
      if(!room.pairingCode)throw Error("Fresh due Class Session is required");
      const scope={facilitatedSessionId:room.facilitatedSessionId};
      try{
        const outside=await openActor(browser,foreign.actor,contexts,true);
        await deny(outside,"room","pairWithFacilitatedRoom",{courseAttemptId:foreign.courseAttemptId,pairingCode:room.pairingCode});
        const pairedActors=new Map<string,Page>();
        for(const l of learners){
          if(l.paired){
            const participant=await openActor(browser,l.actor,contexts,true);
            pairedActors.set(l.courseAttemptId,participant);
            expect(await rpc(participant,"room","pairWithFacilitatedRoom",{courseAttemptId:l.courseAttemptId,pairingCode:room.pairingCode})).toMatchObject({paired:true});
          }
        }
        let activityResponses=0;
        if(instruction){
          const {lessonId,assetVersionId,prompt,choices}=instruction;
          const media=await rpc<{media:{lessonId:string;assetVersionId:string}[]}>(
            page,"room","getFacilitatedRoomMedia",scope);
          expect(media.media.some(m=>m.lessonId===lessonId&&m.assetVersionId===assetVersionId)).toBe(true);
          await deny(outside,"room","getFacilitatedRoomMediaAccess",{...scope,lessonId,assetVersionId});
          const access=await rpc<{downloadUrl:string;expiresInSeconds:number}>(page,"room","getFacilitatedRoomMediaAccess",{...scope,lessonId,assetVersionId});
          // Never attach the signed media URL or manufacture played/ended events.
          if(!access.downloadUrl.startsWith("https://"))throw Error("Expected authorized HTTPS media access");
          const input={...scope,lessonId,requestId:randomUUID(),prompt,answerType:"single_choice",choices};
          const released=await rpc<{id:string;duplicate:boolean}>(page,"activity","releaseClassroomActivity",input);
          expect(released.duplicate).toBe(false);
          expect(await rpc(page,"activity","releaseClassroomActivity",input)).toMatchObject({id:released.id,duplicate:true});
          await deny(outside,"activity","getClassroomLearnerActivities",{...scope,courseAttemptId:foreign.courseAttemptId});
          for(const [courseAttemptId,participant] of pairedActors){
            const learnerScope={...scope,courseAttemptId};
            const visible=await rpc<{activities:{id:string;responded:boolean}[]}>(participant,"activity","getClassroomLearnerActivities",learnerScope);
            expect(visible.activities.find(a=>a.id===released.id)).toMatchObject({responded:false});
            const answer={...learnerScope,activityReleaseId:released.id,clientSubmissionId:randomUUID(),clientInstanceId:randomUUID(),
              answerChoice:0,answerText:null};
            expect(await rpc(participant,"activity","submitClassroomResponse",answer)).toMatchObject({saved:true,duplicate:false,graded:false});
            expect(await rpc(participant,"activity","submitClassroomResponse",answer)).toMatchObject({saved:true,duplicate:true,graded:false});
            activityResponses++;
          }
          expect(await rpc(page,"activity","closeClassroomActivity",{...scope,activityReleaseId:released.id})).toMatchObject({closed:true});
          const [persisted]=await sql`SELECT count(*)::int AS responses,count(DISTINCT course_attempt_id)::int AS attempts
            FROM public.facilitated_room_activity_responses WHERE activity_release_id=${released.id}::uuid
            AND facilitated_session_id=${scope.facilitatedSessionId}::uuid`;
          expect(persisted).toEqual({responses:activityResponses,attempts:activityResponses});
        }
        const before=await rpc<{members:{courseAttemptId:string;latestStatus:string;pairedDevice:boolean}[]}>(page,"attendance","getClassroomAttendanceRoster",scope);
        for(const l of learners){
          expect(before.members.find(m=>m.courseAttemptId===l.courseAttemptId)).toMatchObject({pairedDevice:l.paired,latestStatus:"unknown"});
          const input={...scope,courseAttemptId:l.courseAttemptId,requestId:randomUUID(),status:"present",method:"in_person_roll_call",evidenceNote:"Synthetic QA role-play observation; not real attendance"};
          expect(await rpc(page,"attendance","attestClassroomParticipation",input)).toMatchObject({saved:true,noDeviceEvidence:!l.paired});
          expect(await rpc(page,"attendance","attestClassroomParticipation",input)).toMatchObject({duplicate:true});
          if(!(l.present??l.paired)){
            expect(await rpc(page,"attendance","attestClassroomParticipation",{...input,requestId:randomUUID(),status:"absent",evidenceNote:"Synthetic QA correction of initial role-play observation"})).toMatchObject({saved:true});
          }
        }
        const after=await rpc<typeof before>(page,"attendance","getClassroomAttendanceRoster",scope);
        for(const l of learners)expect(after.members.find(m=>m.courseAttemptId===l.courseAttemptId)?.latestStatus).toBe((l.present??l.paired)?"present":"absent");
        const [attendanceProof]=await sql`SELECT count(*)::int AS assertions,
          count(DISTINCT course_attempt_id)::int AS learners FROM public.facilitated_room_attendance_assertions
          WHERE facilitated_session_id=${scope.facilitatedSessionId}::uuid`;
        expect(attendanceProof).toEqual({assertions:learners.length+learners.filter(l=>!(l.present??l.paired)).length,learners:learners.length});
        evidence={...evidence,instructionalApiJourneyPassed:1,participants:learners.length,paired:learners.filter(l=>l.paired).length,
          corrected:learners.filter(l=>!(l.present??l.paired)).length,authorizedMediaAccess:Boolean(instruction),formativeResponses:activityResponses,playbackVerified:false};
      }finally{
        expect(await rpc(page,"room","endFacilitatedLearningRoom",scope)).toMatchObject({ended:true});
        expect(await rpc(page,"room","endFacilitatedLearningRoom",scope)).toMatchObject({ended:true,alreadyEnded:true});
      }
    }else{
      const {owner,recipient,foreign,siteId,metrics}=scenario;
      if(!owner.privateAccessCode||!recipient.privateAccessCode||!foreign.privateAccessCode)
        throw Error("Reporting relationship authority requires individually authenticated synthetic .demo managers, not .test mailboxes");
      expect(new Set([owner.organizationId,recipient.organizationId,foreign.organizationId]).size).toBe(3);
      const [site]=await sql`SELECT count(*)::int AS count FROM public.sites WHERE id=${siteId}::uuid AND organization_id=${owner.organizationId}::uuid`;
      expect(site?.count).toBe(1);
      const host=await openActor(browser,owner,contexts),hq=await openActor(browser,recipient,contexts),outside=await openActor(browser,foreign,contexts);
      const before=await rpc<{acceptedRelationships:number;awaitingOurResponse:number}>(hq,"relationships","getRelationshipPortfolio");
      const request=await rpc<{id:string;status:string}>(host,"relationships","requestReportingRelationship",{
        recipientOrganizationId:recipient.organizationId,scopeKind:"site",scopeId:siteId,relationshipKind:"affiliation",metrics,validThrough:null});
      expect(request.status).toBe("pending");
      const input={agreementId:request.id,action:"accept"};
      await deny(host,"relationships","decideRelationshipRequest",input);
      await deny(outside,"relationships","decideRelationshipRequest",input);
      expect(await rpc(hq,"relationships","decideRelationshipRequest",input)).toMatchObject({status:"accepted"});
      const accepted=await rpc<typeof before>(hq,"relationships","getRelationshipPortfolio");
      expect(accepted.acceptedRelationships).toBe(before.acceptedRelationships+1);
      expect(await rpc(host,"relationships","decideRelationshipRequest",{agreementId:request.id,action:"revoke"})).toMatchObject({status:"revoked"});
      const after=await rpc<typeof before>(hq,"relationships","getRelationshipPortfolio");
      expect(after.acceptedRelationships).toBe(before.acceptedRelationships);
      const [record]=await sql`SELECT status FROM public.reporting_relationship_agreements WHERE id=${request.id}::uuid`;
      expect(record?.status).toBe("revoked");
      evidence={...evidence,relationshipAccepted:1,relationshipRevoked:1,unauthorizedDecisionsDenied:2,executiveOutcomesVerified:false};
    }
    await info.attach("governed-stage-evidence",{body:JSON.stringify(evidence),contentType:"application/json"});
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
