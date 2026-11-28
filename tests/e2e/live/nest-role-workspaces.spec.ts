import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {NestQaClient,actorSchema,uuid} from "../helpers/nest-qa-client";
const fixture=z.object({attestation:z.literal("fresh-synthetic-role-workspaces"),
 sites:z.array(z.object({
  teacher:actorSchema,guardian:actorSchema,classId:uuid,learnerPersonId:uuid,
  practiceSubmissionId:uuid,missing:z.object({classEnrollmentId:uuid,assignmentId:uuid}).strict(),
  approvedRequestId:uuid,approvalClassId:uuid,creditMode:z.enum(["audit","not_applicable"])
 }).strict()).length(2)}).strict().superRefine((f,ctx)=>{
 const bad=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:"Distinct synthetic teacher, guardian, learner and Class targets required"});
 const actors=f.sites.flatMap(s=>[s.teacher,s.guardian]);
 for(const key of ["personId","grantId","email"] as const)if(new Set(actors.map(a=>a[key])).size!==4)bad();
 for(const key of ["classId","learnerPersonId","practiceSubmissionId","approvedRequestId","approvalClassId"] as const)if(new Set(f.sites.map(s=>s[key])).size!==2)bad();
 if(new Set(f.sites.map(s=>s.teacher.organizationId)).size!==2||new Set(f.sites.map(s=>s.teacher.siteId)).size!==2||f.sites.some(s=>!s.teacher.organizationId||!s.teacher.siteId||s.classId===s.approvalClassId))bad();
}).parse(JSON.parse(process.env.CAN_NEST_ROLES_QA_JSON||"null"));
test("two-tenant teacher and guardian role boundaries and ordinary mutations",async()=>{
 const clients:NestQaClient[]=[];
 const open=async(a:z.infer<typeof actorSchema>)=>{const c=await NestQaClient.create();clients.push(c);await c.login(a);return c;};
 try{
  const sql=neon(process.env.TEST_DATABASE_URL!);
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch:"br-solitary-art-arun91gj"});
  const sites=await Promise.all(fixture.sites.map(async s=>({s,teacher:await open(s.teacher),guardian:await open(s.guardian)})));
  for(const [i,{s,teacher,guardian}] of sites.entries()){
   const foreign=sites[1-i]!,path="/classes/"+s.classId+"/teacher";
   for(const endpoint of ["/me/teacher/classes","/me/teacher/today"]){
    const own=await teacher.get<{kind:string;classes:{classId:string}[]}>(endpoint);
    expect(own.kind).toBe("teacher");expect(own.classes.some(c=>c.classId===s.classId)).toBe(true);
    expect(own.classes.some(c=>c.classId===foreign.s.classId)).toBe(false);
    await guardian.deny("GET",endpoint);
   }
   for(const suffix of ["/homework","/missing-work","/follow-ups","/assessment-readiness","/historical-work","/homework/"+s.practiceSubmissionId+"/history"]){
    await teacher.get(path+suffix);await foreign.teacher.deny("GET",path+suffix);await guardian.deny("GET",path+suffix);
   }
   await teacher.deny("GET",path+"/homework?offset=-1",undefined,[400]);
   const homework=await teacher.get<{items:{id:string;status:string;isPracticeSubmission:boolean}[]}>(path+"/homework");
   expect(homework.items.find(x=>x.id===s.practiceSubmissionId)).toMatchObject({status:"submitted",isPracticeSubmission:true});
   const missing=await teacher.get<{items:{classEnrollmentId:string;assignmentId:string;followUpActionId:string|null}[]}>(path+"/missing-work");
   expect(missing.items.find(x=>x.classEnrollmentId===s.missing.classEnrollmentId&&x.assignmentId===s.missing.assignmentId)).toMatchObject({followUpActionId:null});
   await foreign.teacher.deny("POST",path+"/follow-ups",s.missing);
   await teacher.deny("POST",path+"/follow-ups",foreign.s.missing);
   const followups=await Promise.all([teacher.post<{actionId:string;created:boolean}>(path+"/follow-ups",s.missing),teacher.post<{actionId:string;created:boolean}>(path+"/follow-ups",s.missing)]);
   uuid.parse(followups[0]!.actionId);expect(followups[0]!.actionId).toBe(followups[1]!.actionId);expect(followups.map(x=>x.created).sort()).toEqual([false,true]);
   const feedback={submissionId:s.practiceSubmissionId,feedback:"Synthetic QA formative feedback "+randomUUID(),practiceScore:8};
   await foreign.teacher.deny("POST",path+"/practice-feedback",feedback);
   await teacher.deny("POST",path+"/practice-feedback",{...feedback,submissionId:foreign.s.practiceSubmissionId});
   const result={submissionId:s.practiceSubmissionId,status:"returned",practiceOnly:true};
   expect(await teacher.post(path+"/practice-feedback",feedback)).toEqual(result);
   expect(await teacher.post(path+"/practice-feedback",feedback)).toEqual(result);
   const returned=await teacher.get<{items:{id:string;status:string;teacherFeedback:string;practiceScore:number}[]}>(path+"/homework");
   expect(returned.items.find(x=>x.id===s.practiceSubmissionId)).toMatchObject({status:"returned",teacherFeedback:feedback.feedback,practiceScore:8});
   const [actions]=await sql`SELECT count(*)::int AS count FROM public.actions WHERE subject_id=${s.missing.classEnrollmentId}::uuid AND type='missing_work_follow_up' AND metadata->>'assignmentId'=${s.missing.assignmentId} AND status IN ('open','in_progress','waiting')`;
   expect(actions?.count).toBe(1);
   const children=await guardian.get<{learnerPersonId:string}[]>("/me/guardian/learners");
   expect(children.some(x=>x.learnerPersonId===s.learnerPersonId)).toBe(true);
   expect(children.some(x=>x.learnerPersonId===foreign.s.learnerPersonId)).toBe(false);
   const approvals=await guardian.get<{approvalRequestId:string;learnerPersonId:string;state:string;classId:string}[]>("/me/guardian/class-approvals");
   expect(approvals.find(x=>x.approvalRequestId===s.approvedRequestId)).toMatchObject({learnerPersonId:s.learnerPersonId,state:"approved",classId:s.approvalClassId});
   expect(approvals.some(x=>x.approvalRequestId===foreign.s.approvedRequestId)).toBe(false);
   await guardian.get("/me/guardian/community");
   const accept={approvalRequestId:s.approvedRequestId,creditMode:s.creditMode,consentAccepted:true};
   await foreign.guardian.deny("POST","/guardian-class-approval-acceptances",accept);
   await teacher.deny("POST","/guardian-class-approval-acceptances",accept);
   const enrollment=z.object({classEnrollmentId:uuid,courseAttemptId:uuid}).strict().parse(await guardian.post("/guardian-class-approval-acceptances",accept));
   expect(await guardian.post("/guardian-class-approval-acceptances",accept)).toEqual(enrollment);
   const enrolled=await guardian.get<{classEnrollmentId:string;learnerPersonId:string;status:string}[]>("/me/guardian/class-enrollments");
   expect(enrolled.find(x=>x.classEnrollmentId===enrollment.classEnrollmentId)).toMatchObject({learnerPersonId:s.learnerPersonId,status:"active"});
   const withdraw={classEnrollmentId:enrollment.classEnrollmentId};
   await foreign.guardian.deny("POST","/guardian-class-withdrawals",withdraw);
   expect(await guardian.post("/guardian-class-withdrawals",withdraw)).toEqual({alreadyWithdrawn:false});
   expect(await guardian.post("/guardian-class-withdrawals",withdraw)).toEqual({alreadyWithdrawn:true});
   const [persisted]=await sql`SELECT e.status, a.status AS attempt_status FROM public.class_enrollments e JOIN public.learner_course_attempts a ON a.class_enrollment_id=e.id WHERE e.id=${enrollment.classEnrollmentId}::uuid AND a.id=${enrollment.courseAttemptId}::uuid`;
   expect(persisted).toMatchObject({status:"withdrawn",attempt_status:"withdrawn"});
  }
  for(const c of clients)await c.logout();
 }finally{await Promise.all(clients.map(c=>c.close()));}
});
