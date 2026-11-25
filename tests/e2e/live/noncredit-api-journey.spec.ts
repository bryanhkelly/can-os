import { test, expect, type Page, type Browser } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

// Run the actual Vite-transformed server function clients over HTTP, using
// the existing authenticated cookies. No mocked handler, direct scoring,
// or SQL-created enrollment/assessment/completion evidence. The inert page
// isolates API acceptance from UI rendering; browser/media acceptance is separate.
const origin="http://localhost:5183";
const uuid=z.string().uuid();
const fixture=z.object({
 releaseId:uuid,goCode:z.string().regex(/^[A-Za-z0-9_-]{12}$/),
 goActionLabel:z.string().optional(),trainingTitle:z.string().min(1),
 instructorTitle:z.string().min(1),lessons:z.array(z.string().min(1)).min(1).max(40),
 baselineAnswers:z.array(z.string()).length(5),finalAnswers:z.array(z.string()).length(5),
 surveyTitle:z.string().min(1),
}).strict().parse(JSON.parse(process.env.CAN_PILOT_QA_FIXTURE_JSON??"{}"));
const modules={
 enrollment:"/src/modules/enrollment/noncredit-self-enrollment.functions.ts",
 resume:"/src/modules/enrollment/noncredit-self-enrollment-resume.functions.ts",
 onboarding:"/src/modules/classes/native-class-reviewed-onboarding.functions.ts",
 recovery:"/src/modules/classes/native-class-session-recovery.functions.ts",
 assessments:"/src/modules/learning/noncredit-assessment.functions.ts",
 tracks:"/src/modules/learning/instructional-tracks.functions.ts",
 completion:"/src/modules/learning/noncredit-completion.functions.ts",
 surveys:"/src/modules/learning/course-surveys.functions.ts",
 report:"/src/modules/learning/noncredit-pilot-outcomes.functions.ts",
} as const;
async function rpc<T>(page:Page,module:keyof typeof modules,name:string,data:unknown):Promise<T>{
 return page.evaluate(async ({url,name,data})=>{
   const api=await import(/* @vite-ignore */ url);
   const command=api[name];
   if(typeof command!=="function")throw Error("Missing transformed application command");
   return await command({data});
 },{url:modules[module],name,data}) as Promise<T>;
}
async function actor(browser:Browser,key?:string){
 const context=await browser.newContext({baseURL:origin});
 try{
   if(key){
     const value=process.env[key];if(!value)throw Error("Missing isolated verified session");
     await context.addCookies([{name:"__Host-can_os_session",value,url:origin,secure:true,httpOnly:true,sameSite:"Lax"}]);
   }
   const page=await context.newPage();
   await page.route(origin+"/__pilot_api_test_context",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><title>Local API acceptance</title></html>"}));
   await page.goto(origin+"/__pilot_api_test_context");
   return {context,page};
 }catch(error){await context.close();throw error;}
}
type Question={id:string;options:{id:string;label:string}[]};
type Attempt={attemptId:string;state:string;questions:Question[];draftAnswers:{questionId:string;optionIds:string[]}[]};
async function knowledge(page:Page,courseAttemptId:string,phase:"baseline"|"final",labels:string[]){
 const input={courseAttemptId,phase};
 const start=await rpc<Attempt>(page,"assessments","beginNoncreditKnowledgeCheckAttempt",{...input,requestId:crypto.randomUUID()});
 expect(start.state).toBe("in_progress");
 expect(start.questions).toHaveLength(labels.length);
 const answers=start.questions.map((q,i)=>{
   const matches=q.options.filter(o=>o.label===labels[i]);expect(matches).toHaveLength(1);
   return {questionId:q.id,optionIds:[matches[0]!.id]};
 });
 for(const answer of answers){
   const saved=await rpc<{saved:boolean}>(page,"assessments","saveNoncreditKnowledgeCheckAnswer",{...input,attemptId:start.attemptId,...answer,requestId:crypto.randomUUID()});
   expect(saved.saved).toBe(true);
 }
 const draft=await rpc<Attempt>(page,"assessments","getNoncreditKnowledgeCheck",input);
 expect(draft.draftAnswers).toEqual(expect.arrayContaining(answers));
 const result=await rpc<{state:string;resultId:string;pointsEarned:number;pointsPossible:number;outcome:string}>(page,"assessments","submitNoncreditKnowledgeCheckAnswers",{...input,attemptId:start.attemptId,answers,requestId:crypto.randomUUID()});
 expect(result.state).toBe("finalized");expect(result.pointsPossible).toBeGreaterThan(0);
 return result.pointsEarned/result.pointsPossible;
}
test("actual application RPC and canonical evidence: independent pilot",async({browser})=>{
 const visitor=await actor(browser);
 const learner=await actor(browser,"CAN_PILOT_QA_LEARNER_SESSION");
 const other=await actor(browser,"CAN_PILOT_QA_OTHER_SESSION");
 const provider=await actor(browser,"CAN_PILOT_QA_PROVIDER_SESSION");
 try{
   // The test requires an actual direct adult-training Go destination.
   const go=await visitor.context.request.get("/go/"+fixture.goCode,{maxRedirects:0});
   expect([301,302,303,307,308]).toContain(go.status());
   const location=new URL(go.headers().location??"",origin);
   expect(location.origin).toBe(origin);expect(location.pathname).toBe("/learn/enroll");
   expect(location.searchParams.get("release")).toBe(fixture.releaseId);
   expect(location.searchParams.get("ref")).toBe(fixture.goCode);
   const release=await rpc<{id:string;title:string;consentVersion:string;consentSha256:string}>(visitor.page,"enrollment","getOpenNoncreditSelfEnrollmentById",{releaseId:fixture.releaseId});
   expect(release.id).toBe(fixture.releaseId);expect(release.title).toBe(fixture.trainingTitle);
   const enrollment={releaseId:release.id,consentVersion:release.consentVersion,consentSha256:release.consentSha256,acceptedConsent:true,adultConfirmed:true,referralCode:fixture.goCode};
   await expect(rpc(visitor.page,"enrollment","enrollMyselfInNoncredit",enrollment)).rejects.toThrow();
   await expect(rpc(learner.page,"enrollment","enrollMyselfInNoncredit",{...enrollment,consentSha256:"0".repeat(64)})).rejects.toThrow();
   // Activate the existing independent review without creating another Person.
   expect(await rpc(learner.page,"onboarding","activateReviewedNativeClassLearner",undefined)).toMatchObject({ready:true});
   expect(await rpc(learner.page,"recovery","resumeLinkedNativeClassLearner",undefined)).toMatchObject({ready:true});
   const first=await rpc<{registrationId:string;courseAttemptId:string;alreadyEnrolled:boolean}>(learner.page,"enrollment","enrollMyselfInNoncredit",enrollment);
   expect(first.alreadyEnrolled).toBe(false);uuid.parse(first.registrationId);uuid.parse(first.courseAttemptId);
   const retry=await rpc<typeof first>(learner.page,"enrollment","enrollMyselfInNoncredit",enrollment);
   expect(retry).toMatchObject({...first,alreadyEnrolled:true});
   const course={courseAttemptId:first.courseAttemptId};
   await expect(rpc(other.page,"resume","openMyNoncreditCourse",course)).rejects.toThrow();
   await expect(rpc(other.page,"assessments","getNoncreditKnowledgeCheck",{...course,phase:"baseline"})).rejects.toThrow();
   expect(await rpc(learner.page,"resume","openMyNoncreditCourse",course)).toMatchObject({ready:true});
   const before=await knowledge(learner.page,course.courseAttemptId,"baseline",fixture.baselineAnswers);
   expect(await rpc(learner.page,"surveys","listNoncreditCourseSurveys",course)).toEqual([]);
   const catalog=await rpc<{choices:{title:string;trackVersionId:string}[];selection:null|{revision:number;trackVersionId:string}}>(learner.page,"tracks","getStudentRecordedInstructors",course);
   const choices=catalog.choices.filter(c=>c.title===fixture.instructorTitle);
   expect(choices).toHaveLength(1);
   await rpc(learner.page,"tracks","selectRecordedInstructor",{...course,trackVersionId:choices[0]!.trackVersionId,expectedRevision:catalog.selection?.revision??0,requestId:crypto.randomUUID()});
   const instruction=await rpc<{selection:{revision:number};lessons:{id:string;title:string}[]}>(learner.page,"tracks","getRecordedLessonInstruction",course);
   expect(instruction.lessons.map(l=>l.title)).toEqual(fixture.lessons);
   for(const lesson of instruction.lessons){
     await rpc(learner.page,"tracks","completeRecordedCourseLesson",{...course,lessonId:lesson.id,expectedRevision:instruction.selection.revision,requestId:crypto.randomUUID()});
   }
   expect(await rpc(learner.page,"completion","getNoncreditCompletionReadiness",course)).toMatchObject({recordedCompletion:false});
   const after=await knowledge(learner.page,course.courseAttemptId,"final",fixture.finalAnswers);
   expect(after).toBeGreaterThan(before);expect(after).toBeGreaterThanOrEqual(0.8);
   const surveys=await rpc<{campaignId:string;title:string}[]>(learner.page,"surveys","listNoncreditCourseSurveys",course);
   const matching=surveys.filter(s=>s.title===fixture.surveyTitle);expect(matching).toHaveLength(1);
   const scope={...course,campaignId:matching[0]!.campaignId};
   const survey=await rpc<{questions:{id:string;type:string}[]}>(learner.page,"surveys","getCourseSurvey",scope);
   expect(survey.questions.map(q=>q.type).sort()).toEqual(["rating","rating","rating","rating","text"]);
   const answers=survey.questions.map(q=>q.type==="rating"?{questionId:q.id,number:5}:{questionId:q.id,text:"Synthetic API acceptance"});
   const feedback=await rpc<{responseId:string;alreadySubmitted:boolean}>(learner.page,"surveys","submitCourseSurvey",{...scope,answers});
   expect(feedback.alreadySubmitted).toBe(false);
   expect(await rpc(learner.page,"surveys","submitCourseSurvey",{...scope,answers})).toMatchObject({responseId:feedback.responseId,alreadySubmitted:true});
   expect(await rpc(learner.page,"completion","getNoncreditCompletionReadiness",course)).toMatchObject({recordedCompletion:true});
   await expect(rpc(other.page,"report","getNoncreditPilotOutcomes",{geography:""})).rejects.toThrow();
   const report=await rpc<{distinctLearners:number;deliverySites:number;byTraining:{title:string;summary:Record<string,number|null>}[]}>(provider.page,"report","getNoncreditPilotOutcomes",{geography:""});
   const rows=report.byTraining.filter(r=>r.title===fixture.trainingTitle);expect(rows).toHaveLength(1);
   expect(rows[0]!.summary).toMatchObject({registrations:1,lessonsMarkedComplete:fixture.lessons.length,knowledgeCheckSubmissions:1,knowledgeCheckPasses:1,surveyRespondents:1,confirmedNoncreditCompletions:1,pairedKnowledgeChecks:1,verifiedParticipationMinutes:0});
   expect(rows[0]!.summary.averageImprovementPercentagePoints).toBeCloseTo((after-before)*100);
   // Independent read-only data reconciliation, scoped to the exact fresh
   // release and returned registration. Never write business data via SQL.
   const sql=neon(process.env.TEST_DATABASE_URL!);
   const [evidence]=await sql`
    SELECT
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_claims c WHERE c.release_id=${release.id}::uuid AND c.registration_id=${first.registrationId}::uuid AND c.referral_code=${fixture.goCode}) AS claims,
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_claims c WHERE c.release_id=${release.id}::uuid) AS total_claims,
      (SELECT count(*)::int FROM public.learner_lesson_progress p WHERE p.course_attempt_id=${course.courseAttemptId}::uuid AND p.status='completed') AS lessons,
      (SELECT count(*)::int FROM public.noncredit_completion_decisions d WHERE d.registration_id=${first.registrationId}::uuid AND d.outcome='completed') AS completions,
      (SELECT count(*)::int FROM public.survey_answers a WHERE a.response_id=${feedback.responseId}::uuid) AS answers,
      (SELECT count(*)::int FROM public.participation_attributions a WHERE a.noncredit_registration_id=${first.registrationId}::uuid) AS attributions
   `;
   expect(evidence).toEqual({claims:1,total_claims:1,lessons:fixture.lessons.length,completions:1,answers:5,attributions:1});
 }finally{
   await Promise.all([visitor.context.close(),learner.context.close(),other.context.close(),provider.context.close()]);
 }
});
