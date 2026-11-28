import {test,expect,type Browser,type BrowserContext,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
import {pilotRpcPage,pilotRpc as rpc} from "../helpers/pilot-governed-rpc";

const uuid=z.string().uuid();
const actor=z.object({email:z.string().email().refine(v=>v.endsWith(".test")&&v===v.toLowerCase()),grantId:uuid,organizationId:uuid}).strict();
const meeting=z.object({requestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,agendaRequestId:uuid}).strict();
const metric=z.object({metricKey:z.enum(["class.registrations","class.uniquePeople","noncredit.registrations","noncredit.distinctLearners"]),definitionVersion:z.string().min(1).max(64)}).strict();
const siteScope=z.object({host:actor,classId:uuid,siteId:uuid,meetings:z.array(meeting).length(4)}).strict();
const learner=z.object({actor,courseAttemptId:uuid,paired:z.boolean()}).strict();
const manifest=z.object({offeringVersionId:uuid,manifestId:uuid,expectedHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const scenario=z.discriminatedUnion("stage",[
  z.object({stage:z.literal("publish"),publisher:actor,offering:manifest}).strict(),
  z.object({stage:z.literal("schedule"),sites:z.array(siteScope).length(2)}).strict(),
  z.object({stage:z.literal("deliver"),host:actor,classId:uuid,siteId:uuid,classSessionId:uuid,
    learners:z.array(learner).min(2).max(20),foreign:learner}).strict(),
  z.object({stage:z.literal("relationships"),owner:actor,recipient:actor,foreign:actor,siteId:uuid,metrics:z.array(metric).min(1).max(4)}).strict()
]).parse(JSON.parse(process.env.CAN_PILOT_QA_GOVERNED_JSON??"{}"));
const sql=neon(process.env.TEST_DATABASE_URL!);
const branch="br-solitary-art-arun91gj";
type Actor=z.infer<typeof actor>;
async function authorizeFixture(a:Actor){
  const [row]=await sql`SELECT count(*)::int AS count FROM public.access_accounts ac
    JOIN public.people p ON p.id=ac.person_id
    JOIN public.organizations o ON o.id=${a.organizationId}::uuid
    WHERE ac.email_normalized=${a.email} AND ac.email_verified_at IS NOT NULL AND NOT ac.disabled AND p.active
      AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}`;
  expect(row?.count).toBe(1);
}
async function openActor(browser:Browser,a:Actor,contexts:BrowserContext[]):Promise<Page>{
  await authorizeFixture(a);
  const context=await browser.newContext();contexts.push(context);
  const initial=await authenticateQaActor(context,a.email);
  const grant=initial.grants.find(g=>g.id===a.grantId);
  if(!grant||grant.organizationId!==a.organizationId)throw Error("Exact authorized QA membership required");
  if(initial.activeGrantId!==a.grantId){
    const switched=await context.request.post("http://localhost:5183/access/session",{headers:{Origin:"http://localhost:5183"},data:{grantId:a.grantId}});
    expect(switched.ok()).toBe(true);
  }
  expect((await qaSession(context)).activeGrantId).toBe(a.grantId);
  return pilotRpcPage(context);
}
async function classScope(classId:string,siteId:string,ownerId:string){
  const [row]=await sql`SELECT count(*)::int AS count FROM public.classes c
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
    JOIN public.organizations o ON o.id=c.operating_organization_id
    WHERE c.id=${classId}::uuid AND s.id=${siteId}::uuid AND o.id=${ownerId}::uuid
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch} AND c.state='active'`;
  expect(row?.count).toBe(1);
}
test("governed pilot API stage",async({browser},info)=>{
  const contexts:BrowserContext[]=[];
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch});
  let evidence:Record<string,unknown>={stage:scenario.stage,revision:process.env.CAN_RELEASE_SOURCE_SHA};
  try{
    if(scenario.stage==="publish"){
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
      const {host,classId,siteId,classSessionId,learners,foreign}=scenario;
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
        const outside=await openActor(browser,foreign.actor,contexts);
        await expect(rpc(outside,"room","pairWithFacilitatedRoom",{courseAttemptId:foreign.courseAttemptId,pairingCode:room.pairingCode})).rejects.toThrow();
        for(const l of learners){
          if(l.paired){
            const participant=await openActor(browser,l.actor,contexts);
            expect(await rpc(participant,"room","pairWithFacilitatedRoom",{courseAttemptId:l.courseAttemptId,pairingCode:room.pairingCode})).toMatchObject({paired:true});
          }
        }
        const before=await rpc<{members:{courseAttemptId:string;latestStatus:string;pairedDevice:boolean}[]}>(page,"attendance","getClassroomAttendanceRoster",scope);
        for(const l of learners){
          expect(before.members.find(m=>m.courseAttemptId===l.courseAttemptId)).toMatchObject({pairedDevice:l.paired,latestStatus:"unknown"});
          const input={...scope,courseAttemptId:l.courseAttemptId,requestId:randomUUID(),status:"present",method:"in_person_roll_call",evidenceNote:"Synthetic QA role-play observation; not real attendance"};
          expect(await rpc(page,"attendance","attestClassroomParticipation",input)).toMatchObject({saved:true,noDeviceEvidence:!l.paired});
          expect(await rpc(page,"attendance","attestClassroomParticipation",input)).toMatchObject({duplicate:true});
          if(!l.paired){
            expect(await rpc(page,"attendance","attestClassroomParticipation",{...input,requestId:randomUUID(),status:"absent",evidenceNote:"Synthetic QA correction of initial role-play observation"})).toMatchObject({saved:true});
          }
        }
        const after=await rpc<typeof before>(page,"attendance","getClassroomAttendanceRoster",scope);
        for(const l of learners)expect(after.members.find(m=>m.courseAttemptId===l.courseAttemptId)?.latestStatus).toBe(l.paired?"present":"absent");
        evidence={...evidence,sessionDelivered:1,participants:learners.length,paired:learners.filter(l=>l.paired).length,
          corrected:learners.filter(l=>!l.paired).length,playbackVerified:false};
      }finally{
        expect(await rpc(page,"room","endFacilitatedLearningRoom",scope)).toMatchObject({ended:true});
      }
    }else{
      const {owner,recipient,foreign,siteId,metrics}=scenario;
      expect(new Set([owner.organizationId,recipient.organizationId,foreign.organizationId]).size).toBe(3);
      const [site]=await sql`SELECT count(*)::int AS count FROM public.sites WHERE id=${siteId}::uuid AND organization_id=${owner.organizationId}::uuid`;
      expect(site?.count).toBe(1);
      const host=await openActor(browser,owner,contexts),hq=await openActor(browser,recipient,contexts),outside=await openActor(browser,foreign,contexts);
      const before=await rpc<{acceptedRelationships:number;awaitingOurResponse:number}>(hq,"relationships","getRelationshipPortfolio");
      const request=await rpc<{id:string;status:string}>(host,"relationships","requestReportingRelationship",{
        recipientOrganizationId:recipient.organizationId,scopeKind:"site",scopeId:siteId,relationshipKind:"affiliation",metrics,validThrough:null});
      expect(request.status).toBe("pending");
      const input={agreementId:request.id,action:"accept"};
      await expect(rpc(host,"relationships","decideRelationshipRequest",input)).rejects.toThrow();
      await expect(rpc(outside,"relationships","decideRelationshipRequest",input)).rejects.toThrow();
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
