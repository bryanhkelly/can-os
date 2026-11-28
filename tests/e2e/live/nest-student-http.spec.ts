import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid();
const enrollment=z.object({classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid}).strict();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid,canonicalOnly:z.boolean(),enrollments:z.array(enrollment).min(1)}).strict();
const fixture=z.object({students:z.array(actor).length(2),recorded:z.object({attestation:z.literal("fresh-synthetic-recorded-choice-fixture"),personId:uuid,classEnrollmentId:uuid,trackVersionIds:z.tuple([uuid,uuid])}).strict().optional(),write:z.object({attestation:z.literal("fresh-synthetic-fixture"),personId:uuid,classEnrollmentId:uuid,lessonId:uuid,assignmentId:uuid}).strict().optional()}).strict().refine(f=>{
 const [a,b]=f.students;
 return !!a&&!!b&&a.email!==b.email&&a.personId!==b.personId&&a.grantId!==b.grantId&&a.siteId!==b.siteId&&a.canonicalOnly!==b.canonicalOnly&&
 a.enrollments.every(e=>!b.enrollments.some(x=>x.classEnrollmentId===e.classEnrollmentId||x.courseAttemptId===e.courseAttemptId))&&(!f.recorded||(f.recorded.trackVersionIds[0]!==f.recorded.trackVersionIds[1]&&f.students.some(s=>s.personId===f.recorded!.personId&&s.enrollments.some(e=>e.classEnrollmentId===f.recorded!.classEnrollmentId))))&&(!f.write||f.students.some(s=>s.personId===f.write!.personId&&s.enrollments.some(e=>e.classEnrollmentId===f.write!.classEnrollmentId)));
},"Two distinct reviewed students and Sites required").parse(JSON.parse(process.env.CAN_STUDENT_QA_JSON??"{}"));
const api="http://localhost:3001/api/v1";
const origin="http://localhost:3001";
const classes=z.object({kind:z.literal("student"),classes:z.array(z.object({classId:uuid,enrollmentId:uuid.nullable(),courseAttemptId:uuid.nullable(),status:z.string()}))});
const homework=z.object({assignments:z.array(z.object({id:uuid,title:z.string(),status:z.string(),dueAt:z.string().nullable(),submittedAt:z.string().nullable()}).strict())}).strict();

test("independent standard HTTP client validates both students and rejects foreign enrollment resources",async()=>{
 const contexts:APIRequestContext[]=[];
 const clients=new Map<string,APIRequestContext>();
 async function client(){const context=await request.newContext();contexts.push(context);return context;}
 try {
   const anonymous=await client();
   expect((await anonymous.get(api+"/me")).status()).toBe(401);
   expect((await anonymous.get(api+"/me/class-enrollments/"+fixture.students[0]!.enrollments[0]!.classEnrollmentId+"/learning")).status()).toBe(401);
   expect((await anonymous.post(api+"/me/session/activity",{headers:{Origin:origin},data:{}})).status()).toBe(401);
   for(const student of fixture.students){
     const http=await client(), context={request:http};
     clients.set(student.personId,http);
     const session=await authenticateQaActor(context,student.email,undefined,"nest");
     expect(session.grants.find(g=>g.id===student.grantId)).toMatchObject({role:"student",personId:student.personId,siteId:student.siteId,organizationId:student.organizationId});
     expect((await http.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:student.grantId}})).status()).toBe(204);
     expect((await http.post(api+"/me/session/activity",{headers:{Origin:origin},data:{}})).status()).toBe(204);
     expect((await http.post(api+"/me/session/activity",{headers:{Origin:"https://foreign.example"},data:{}})).status()).toBe(403);
     expect((await http.post(api+"/me/session/activity",{data:{}})).status()).toBe(403);
     expect((await http.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:student.grantId,personId:student.personId}})).status()).toBe(400);
     expect((await qaSession(context,"nest")).activeGrantId).toBe(student.grantId);
     const me=await http.get(api+"/me");expect(me.status()).toBe(200);
     expect(await me.json()).toMatchObject({personId:student.personId,grantId:student.grantId,role:"student",siteIds:[student.siteId],organizationIds:[student.organizationId]});
     const response=await http.get(api+"/me/student/classes");expect(response.status()).toBe(200);
     const own=classes.parse(await response.json());
     expect(own.classes.filter(c=>c.status==="active").map(c=>c.enrollmentId).sort()).toEqual(student.enrollments.map(e=>e.classEnrollmentId).sort());
     for(const e of student.enrollments){
       expect(own.classes.find(c=>c.enrollmentId===e.classEnrollmentId)).toMatchObject({classId:e.classId,courseAttemptId:e.courseAttemptId});
       const classPath=api+"/classes/"+e.classId;
       const workspace=await http.get(classPath+"/workspace?view=learn");expect(workspace.status()).toBe(200);
       const projection=await workspace.json();
       expect(projection).toMatchObject({classId:e.classId,view:"learn",learner:{classEnrollmentId:e.classEnrollmentId,courseAttemptId:e.courseAttemptId},roster:[],staffCandidates:[],staffAssignments:[],learnerCandidates:[],offering:null,canControlRoom:false});
       expect(projection.sessions.every((session:{planId:string|null;roomId:string|null;roomState:string|null})=>session.planId===null&&session.roomId===null&&session.roomState===null)).toBe(true);
       expect((await http.get(classPath+"/workspace?view=teach")).status()).toBe(403);
       expect((await http.get(classPath+"/workspace?view=manage")).status()).toBe(403);
       expect((await http.get(classPath+"/roster")).status()).toBe(403);
       expect((await http.get(classPath+"/workspace?view=learn&personId="+student.personId)).status()).toBe(400);
       const target=api+"/me/class-enrollments/"+e.classEnrollmentId;
       const resume=await http.get(target+"/resume");expect(resume.status()).toBe(200);
       expect(await resume.json()).toMatchObject({classId:e.classId});
       const assignments=await http.get(target+"/assignments");expect(assignments.status()).toBe(200);
       homework.parse(await assignments.json());
       const learning=await http.get(target+"/learning");expect(learning.status()).toBe(200);
       expect(await learning.json()).toMatchObject({classId:e.classId,classEnrollmentId:e.classEnrollmentId,courseAttemptId:e.courseAttemptId,lessons:expect.any(Array),outcomes:expect.any(Array),awards:expect.any(Array)});
       expect(learning.headers()["cache-control"]).toBe("no-store");
       const detail=await http.get(target+"/assignment-workspace");expect(detail.status()).toBe(200);
       expect(await detail.json()).toMatchObject({courseAttemptId:e.courseAttemptId,assignments:expect.any(Array)});
       const instructionTarget=api+"/me/course-attempts/"+e.courseAttemptId;
       const choices=await http.get(instructionTarget+"/instructors");expect(choices.status()).toBe(200);
       const choiceShape=z.object({choices:z.array(z.object({trackVersionId:uuid,policyVersionId:uuid})),blocked:z.array(z.object({trackVersionId:uuid})),selection:z.object({trackVersionId:uuid,revision:z.number().int().positive(),policyVersionId:uuid}).nullable()}).parse(await choices.json());
       const history=await http.get(instructionTarget+"/practice-history");expect(history.status()).toBe(200);
       expect(Array.isArray(await history.json())).toBe(true);
       expect((await http.get(instructionTarget+"/instructors?personId="+student.personId)).status()).toBe(400);
       if(choiceShape.selection&&choiceShape.choices.some(c=>c.trackVersionId===choiceShape.selection?.trackVersionId&&c.policyVersionId===choiceShape.selection?.policyVersionId)){
         // A currently eligible selected presenter must open via the same course attempt.
         const selected=await http.get(instructionTarget+"/instruction");expect(selected.status()).toBe(200);
         expect(await selected.json()).toMatchObject({courseAttemptId:e.courseAttemptId,selection:{trackVersionId:choiceShape.selection.trackVersionId}});
       }
     }
     for(const foreign of fixture.students.filter(s=>s.personId!==student.personId)){
       expect((await http.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:foreign.grantId}})).status()).toBe(403);
       expect((await qaSession(context,"nest")).activeGrantId).toBe(student.grantId);
       for(const e of foreign.enrollments){
         expect(own.classes.some(c=>c.classId===e.classId||c.enrollmentId===e.classEnrollmentId)).toBe(false);
         expect((await http.get(api+"/classes/"+e.classId+"/workspace?view=learn")).status()).toBe(403);
         expect((await http.get(api+"/classes/"+e.classId+"/roster")).status()).toBe(403);
         const foreignInstruction=api+"/me/course-attempts/"+e.courseAttemptId;
         for(const resource of ["instructors","instruction","practice-history"]){
           expect((await http.get(foreignInstruction+"/"+resource)).status()).toBe(403);
         }
         expect((await http.post(foreignInstruction+"/instructor-selections",{headers:{Origin:origin},data:{requestId:e.courseAttemptId,trackVersionId:e.courseAttemptId,expectedRevision:0}})).status()).toBe(403);
         for(const resource of ["resume","assignments","learning","assignment-workspace","historical-work"]){
           const denied=await http.get(api+"/me/class-enrollments/"+e.classEnrollmentId+"/"+resource);
           expect(denied.status()).toBe(403);
           expect((await denied.json()).code).toBe("FORBIDDEN");
         }
       }
     }
     expect((await http.get(api+"/classroom-rehearsal/choices")).status()).toBe(403);
     for(const resource of ["resume","learning","assignment-workspace"])expect((await http.get(api+"/me/class-enrollments/not-a-uuid/"+resource)).status()).toBe(400);
   }
   if(fixture.write){
     const w=fixture.write;
     const own=clients.get(w.personId)!;
     const foreign=clients.get(fixture.students.find(s=>s.personId!==w.personId)!.personId)!;
     const target=api+"/me/class-enrollments/"+w.classEnrollmentId;
     const lesson=target+"/lessons/"+w.lessonId+"/completion";
     const assignment=target+"/assignments/"+w.assignmentId+"/submission";
     const options={headers:{Origin:origin}};
     const input={responseText:"Synthetic QA practice answer"};
     const before=await own.get(target+"/resume");expect(before.status()).toBe(200);
     const progress=z.object({completed:z.number().int().nonnegative(),total:z.number().int().nonnegative()}).parse(await before.json());
     const list=await own.get(target+"/assignments");expect(list.status()).toBe(200);
     expect(homework.parse(await list.json()).assignments.find(a=>a.id===w.assignmentId)?.status).toBe("not_started");
     for(const [url,data] of [[lesson,{}],[assignment,input]] as const){
       const denied=await foreign.post(url,{...options,data});expect(denied.status()).toBe(403);
       expect((await denied.json()).code).toBe("FORBIDDEN");
     }
     const completed=await own.post(lesson,{...options,data:{}});expect(completed.status()).toBe(200);
     expect(await completed.json()).toEqual({recorded:true,alreadyCompleted:false});
     const replay=await own.post(lesson,{...options,data:{}});expect(replay.status()).toBe(200);
     expect(await replay.json()).toEqual({recorded:true,alreadyCompleted:true});
     const after=await own.get(target+"/resume");expect(after.status()).toBe(200);
     expect(await after.json()).toMatchObject({completed:progress.completed+1,total:progress.total});
     const workspace=await own.get(target+"/learning");expect(workspace.status()).toBe(200);
     const lessons=z.object({lessons:z.array(z.object({lessonId:uuid,progressStatus:z.string().nullable()}))}).parse(await workspace.json());
     expect(lessons.lessons.find(l=>l.lessonId===w.lessonId)?.progressStatus).toBe("completed");
     const submitted=await own.post(assignment,{...options,data:input});expect(submitted.status()).toBe(200);
     const first=z.object({submissionId:uuid,alreadySubmitted:z.literal(false)}).parse(await submitted.json());
     const duplicate=await own.post(assignment,{...options,data:input});expect(duplicate.status()).toBe(200);
     expect(await duplicate.json()).toEqual({submissionId:first.submissionId,alreadySubmitted:true});
     expect((await own.post(assignment,{...options,data:{responseText:"Different response must not overwrite"}})).status()).toBe(403);
     const latest=await own.get(target+"/assignments");expect(latest.status()).toBe(200);
     expect(homework.parse(await latest.json()).assignments.find(a=>a.id===w.assignmentId)?.status).toBe("submitted");
     const revisions=await own.get(target+"/assignments/"+w.assignmentId+"/revisions");expect(revisions.status()).toBe(200);
     const page=z.object({items:z.array(z.object({revisionNo:z.number().int().positive(),responseText:z.string()})),nextBefore:z.number().int().positive().nullable()}).parse(await revisions.json());
     expect(page.items.length).toBeLessThanOrEqual(20);
     const foreignRevisions=await foreign.get(target+"/assignments/"+w.assignmentId+"/revisions");expect(foreignRevisions.status()).toBe(403);
     const malformed=await own.get(target+"/assignments/"+w.assignmentId+"/revisions?beforeRevision=0");expect(malformed.status()).toBe(400);
     const detail=await own.get(target+"/assignment-workspace");expect(detail.status()).toBe(200);
     expect((await detail.json()).assignments.find((a:{id:string})=>a.id===w.assignmentId)).toMatchObject({status:"submitted",responseText:input.responseText,submitted:true});
   }
   for(const http of clients.values()){
     const logout=await http.post(api+"/access/logout",{headers:{Origin:origin},data:{}});
     expect(logout.status()).toBe(204);
     expect((await http.get(api+"/access/session")).status()).toBe(401);
     expect((await http.get(api+"/me")).status()).toBe(401);
   }
 } finally {await Promise.all(contexts.map(c=>c.dispose()));}
});

test("recorded instructor switch preserves enrollment and learning evidence through ordinary REST",async()=>{
 test.skip(!fixture.recorded,"Reviewed fresh two-presenter fixture not supplied; switching acceptance is not established");
 const w=fixture.recorded!;
 const student=fixture.students.find(s=>s.personId===w.personId)!;
 const enrollment=student.enrollments.find(e=>e.classEnrollmentId===w.classEnrollmentId)!;
 const http=await request.newContext();
 const options={headers:{Origin:origin}};
 try{
  const session=await authenticateQaActor({request:http},student.email,undefined,"nest");
  expect(session.grants.find(g=>g.id===student.grantId)).toMatchObject({personId:student.personId,role:"student"});
  expect((await http.post(api+"/me/session/membership",{...options,data:{grantId:student.grantId}})).status()).toBe(204);
  const course=api+"/me/course-attempts/"+enrollment.courseAttemptId;
  const classResource=api+"/me/class-enrollments/"+enrollment.classEnrollmentId;
  const choices=async()=>{
   const res=await http.get(course+"/instructors");expect(res.status()).toBe(200);
   return z.object({choices:z.array(z.object({trackVersionId:uuid,allowSwitching:z.boolean()})),selection:z.object({trackVersionId:uuid,revision:z.number().int().positive()}).nullable()}).parse(await res.json());
  };
  const workspace=async()=>{
   const res=await http.get(classResource+"/learning");expect(res.status()).toBe(200);
   return z.object({classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid,courseVersionId:uuid,enrollmentStatus:z.string(),creditMode:z.string(),lessons:z.array(z.object({lessonId:uuid,progressStatus:z.string().nullable(),observedAt:z.string().nullable()})),outcomes:z.array(z.unknown()),awards:z.array(z.unknown())}).parse(await res.json());
  };
  const before=await workspace();
  const initial=await choices();
  for(const id of w.trackVersionIds)expect(initial.choices.find(c=>c.trackVersionId===id)?.allowSwitching).toBe(true);
  if(initial.selection)expect(w.trackVersionIds).toContain(initial.selection.trackVersionId);
  const target=w.trackVersionIds.find(id=>id!==initial.selection?.trackVersionId)!;
  const priorRevision=initial.selection?.revision??0;
  const command={requestId:randomUUID(),trackVersionId:target,expectedRevision:priorRevision};
  const route=course+"/instructor-selections";
  const result=await http.post(route,{...options,data:command});expect(result.status()).toBe(200);
  const receipt=z.object({courseAttemptId:uuid,trackVersionId:uuid,revision:z.number().int().positive(),selectionId:uuid}).parse(await result.json());
  expect(receipt).toMatchObject({courseAttemptId:enrollment.courseAttemptId,trackVersionId:target,revision:priorRevision+1});
  const replay=await http.post(route,{...options,data:command});expect(replay.status()).toBe(200);expect(await replay.json()).toMatchObject(receipt);
  const other=w.trackVersionIds.find(id=>id!==target)!;
  expect((await http.post(route,{...options,data:{...command,trackVersionId:other}})).status()).toBe(409);
  expect((await http.post(route,{...options,data:{requestId:randomUUID(),trackVersionId:other,expectedRevision:priorRevision}})).status()).toBe(409);
  const selected=await http.get(course+"/instruction");expect(selected.status()).toBe(200);
  expect(await selected.json()).toMatchObject({courseAttemptId:enrollment.courseAttemptId,selection:{trackVersionId:target,revision:receipt.revision}});
  const switchBack=await http.post(route,{...options,data:{requestId:randomUUID(),trackVersionId:other,expectedRevision:receipt.revision}});expect(switchBack.status()).toBe(200);
  expect(await switchBack.json()).toMatchObject({courseAttemptId:enrollment.courseAttemptId,trackVersionId:other,revision:receipt.revision+1});
  expect(await workspace()).toEqual(before);
  expect((await http.post(api+"/access/logout",{...options,data:{}})).status()).toBe(204);
 }finally{await http.dispose();}
});
