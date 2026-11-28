import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {NestQaClient,actorSchema,uuid,query} from "../helpers/nest-qa-client";
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const cohort=z.object({
 provider:actorSchema,learner:actorSchema,siteId:uuid,releaseId:uuid,trainingVersionId:uuid,
 consentVersion:z.string().min(3),consentSha256:hash,
 instructorTitle:z.string().min(1),lessonTitles:z.array(z.string()).min(1).max(40),
 baselineAnswers:z.array(z.string()).length(5),finalAnswers:z.array(z.string()).length(5),surveyTitle:z.string().min(1),
}).strict();
const fixture=z.object({attestation:z.literal("fresh-synthetic-independent-cohorts"),sites:z.array(cohort).length(2),from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true})}).strict().superRefine((f,ctx)=>{
 const bad=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:"Distinct reviewed cohorts and actors, exact provider scope and bounded time window required"});
 for(const key of ["siteId","releaseId","trainingVersionId"] as const)if(new Set(f.sites.map(s=>s[key])).size!==2)bad();
 const actors=f.sites.flatMap(s=>[s.provider,s.learner]);
 for(const key of ["email","personId","grantId"] as const)if(new Set(actors.map(a=>a[key])).size!==4)bad();
 if(new Set(f.sites.map(s=>s.provider.organizationId)).size!==2||f.sites.some(s=>!s.provider.organizationId||s.provider.siteId!==s.siteId))bad();
 if(!(Date.parse(f.from)<Date.now()&&Date.parse(f.to)>Date.now()&&Date.parse(f.to)-Date.parse(f.from)<=366*86400000))bad();
});
const f=fixture.parse(JSON.parse(process.env.CAN_NEST_PILOT1_QA_JSON||"null"));
const question=z.object({id:uuid,options:z.array(z.object({id:uuid,label:z.string()}))});
const attempt=z.object({attemptId:uuid,state:z.literal("in_progress"),questions:z.array(question)});
const finalized=z.object({state:z.literal("finalized"),resultId:uuid,pointsEarned:z.number(),pointsPossible:z.number().positive()});
const receipt=z.object({registrationId:uuid,courseAttemptId:uuid,classId:uuid,classEnrollmentId:uuid,alreadyEnrolled:z.boolean()}).strict();
async function knowledge(c:NestQaClient,id:string,phase:"baseline"|"final",labels:string[]){
 const scope={courseAttemptId:id,phase};
 const start=attempt.parse(await c.post("/knowledge-check-attempts",{...scope,requestId:randomUUID()}));
 expect(start.questions).toHaveLength(labels.length);
 const answers=start.questions.map((q,i)=>{
  const match=q.options.filter(o=>o.label===labels[i]);expect(match).toHaveLength(1);
  return {questionId:q.id,optionIds:[match[0]!.id]};
 });
 for(const answer of answers)expect(await c.post("/knowledge-check-draft-answers",{...scope,attemptId:start.attemptId,...answer,requestId:randomUUID()})).toMatchObject({saved:true});
 const current=await c.get<{draftAnswers:unknown[]}>(query("/knowledge-check",scope));
 expect(current.draftAnswers).toEqual(expect.arrayContaining(answers));
 const input={...scope,attemptId:start.attemptId,answers,requestId:randomUUID()};
 const result=finalized.parse(await c.post("/knowledge-check-submissions",input));
 return result.pointsEarned/result.pointsPossible;
}
test("independent pilot learning on two Sites using only ordinary Nest APIs",async()=>{
 const clients:NestQaClient[]=[];
 async function open(){const c=await NestQaClient.create();clients.push(c);return c;}
 try{
  const anonymous=await open();
  const sessions=await Promise.all(f.sites.map(async s=>{
    const provider=await open(),learner=await open();
    await provider.login(s.provider);await learner.login(s.learner);
    return {s,provider,learner};
  }));
  const sql=neon(process.env.TEST_DATABASE_URL!);
  const [dbIdentity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(dbIdentity).toEqual({project:"sweet-hall-62441909",branch:"br-solitary-art-arun91gj"});
  // Both learner identities must be established before foreign-scope assertions.
  for(const {learner} of sessions){
   expect(await learner.post("/me/learning-session/activate",{})).toEqual({ready:true});
   expect(await learner.post("/me/learning-session/resume",{})).toEqual({ready:true});
  }
  for(const [i,{s,provider,learner}] of sessions.entries()){
   const outside=sessions[1-i]!.learner;
   const input={releaseId:s.releaseId,consentVersion:s.consentVersion,consentSha256:s.consentSha256,acceptedConsent:true,adultConfirmed:true};
   await anonymous.deny("POST","/noncredit-registrations",input,[401]);
   await learner.deny("POST","/noncredit-registrations",{...input,consentSha256:"0".repeat(64)},[400,403,409]);
   const first=receipt.parse(await learner.post("/noncredit-registrations",input));
   expect(first.alreadyEnrolled).toBe(false);expect(first.registrationId).not.toBe(first.classEnrollmentId);
   expect(await learner.post("/noncredit-registrations",input)).toEqual({...first,alreadyEnrolled:true});
   const id=first.courseAttemptId,scope={courseAttemptId:id},path="/me/course-attempts/"+id;
   await outside.deny("GET",query("/knowledge-check",{...scope,phase:"baseline"}));
   await outside.deny("GET",path+"/instructors");
   const before=await knowledge(learner,id,"baseline",s.baselineAnswers);
   const catalog=await learner.get<{choices:{title:string;trackVersionId:string}[];selection:{revision:number}|null}>(path+"/instructors");
   const tracks=catalog.choices.filter(t=>t.title===s.instructorTitle);expect(tracks).toHaveLength(1);
   const chosen=await learner.post<{revision:number}>(path+"/instructor-selections",{trackVersionId:tracks[0]!.trackVersionId,expectedRevision:catalog.selection?.revision??0,requestId:randomUUID()});
   const instruction=await learner.get<{selection:{revision:number};lessons:{id:string;title:string}[]}>(path+"/instruction");
   expect(instruction.selection.revision).toBe(chosen.revision);
   expect(instruction.lessons.map(l=>l.title)).toEqual(s.lessonTitles);
   for(const lesson of instruction.lessons){
    const command={lessonId:lesson.id,expectedRevision:chosen.revision,requestId:randomUUID()};
    await outside.deny("POST",path+"/recorded-lesson-completions",command);
    expect(await learner.post(path+"/recorded-lesson-completions",command)).toMatchObject({courseAttemptId:id,lessonId:lesson.id,status:"completed"});
   }
   expect(await learner.get(query("/completion-readiness",scope))).toMatchObject({recordedCompletion:false,completedLessons:s.lessonTitles.length});
   const after=await knowledge(learner,id,"final",s.finalAnswers);expect(after).toBeGreaterThan(before);expect(after).toBeGreaterThanOrEqual(0.8);
   const surveys=await learner.get<{campaignId:string;title:string}[]>(query("/course-surveys",scope));
   const matching=surveys.filter(x=>x.title===s.surveyTitle);expect(matching).toHaveLength(1);
   const surveyScope={...scope,campaignId:matching[0]!.campaignId};
   const survey=await learner.get<{questions:{id:string;type:string}[];submitted:boolean}>(query("/course-survey",surveyScope));
   expect(survey.submitted).toBe(false);
   expect(survey.questions.map(q=>q.type).sort()).toEqual(["rating","rating","rating","rating","text"]);
   const answers=survey.questions.map(q=>q.type==="rating"?{questionId:q.id,number:5}:{questionId:q.id,text:"Synthetic API acceptance"});
   const payload={...surveyScope,answers};
   await outside.deny("POST","/course-survey-responses",payload);
   const feedback=await learner.post<{responseId:string;alreadySubmitted:boolean}>("/course-survey-responses",payload);
   uuid.parse(feedback.responseId);expect(feedback.alreadySubmitted).toBe(false);
   expect(await learner.post("/course-survey-responses",payload)).toEqual({...feedback,alreadySubmitted:true});
   expect(await learner.get(query("/completion-readiness",scope))).toMatchObject({recordedCompletion:true});
   const reportPath=query("/reports/noncredit-pilot-outcomes",{siteId:s.siteId,from:f.from,to:f.to});
   await learner.deny("GET",reportPath);
   await sessions[1-i]!.provider.deny("GET",reportPath);
   const report=await provider.get<{disclosureApproved:boolean;byTraining:{trainingVersionId:string;summary:Record<string,number>}[]}>(reportPath);
   expect(report.disclosureApproved).toBe(false);
   const rows=report.byTraining.filter(r=>r.trainingVersionId===s.trainingVersionId);expect(rows).toHaveLength(1);
   expect(rows[0]!.summary).toMatchObject({registrations:1,lessonsMarkedComplete:s.lessonTitles.length,knowledgeCheckSubmissions:1,knowledgeCheckPasses:1,surveyRespondents:1,confirmedNoncreditCompletions:1,pairedKnowledgeChecks:1,verifiedParticipationMinutes:0});
   expect(rows[0]!.summary.averageImprovementPercentagePoints).toBeCloseTo((after-before)*100);
   // Independent read-only reconciliation: no database-created journey state.
   const [placement]=await sql`
    SELECT n.id::text AS registration,e.id::text AS enrollment,e.class_id::text AS class_id,
      a.id::text AS attempt,e.status AS enrollment_status
    FROM public.noncredit_registrations n
    JOIN public.learner_course_attempts a ON a.noncredit_registration_id=n.id
    JOIN public.class_enrollments e ON e.id=a.class_enrollment_id AND e.course_attempt_id=a.id
      AND e.learner_person_id=n.participant_person_id
    WHERE n.id=${first.registrationId}::uuid AND a.id=${id}::uuid
   `;
   expect(placement).toEqual({registration:first.registrationId,enrollment:first.classEnrollmentId,class_id:first.classId,attempt:id,enrollment_status:"active"});
   const [persisted]=await sql`
    SELECT
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_claims c WHERE c.release_id=${s.releaseId}::uuid AND c.registration_id=${first.registrationId}::uuid) AS claims,
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_claims c WHERE c.release_id=${s.releaseId}::uuid) AS total_claims,
      (SELECT count(*)::int FROM public.learner_lesson_progress p WHERE p.course_attempt_id=${id}::uuid AND p.status='completed') AS lessons,
      (SELECT count(*)::int FROM public.noncredit_completion_decisions d WHERE d.registration_id=${first.registrationId}::uuid AND d.outcome='completed') AS completions,
      (SELECT count(*)::int FROM public.survey_answers a WHERE a.response_id=${feedback.responseId}::uuid) AS answers
   `;
   expect(persisted).toEqual({claims:1,total_claims:1,lessons:s.lessonTitles.length,completions:1,answers:5});
  }
  for(const {provider,learner} of sessions){await provider.logout();await learner.logout();}
 }finally{await Promise.all(clients.map(c=>c.close()));}
});
