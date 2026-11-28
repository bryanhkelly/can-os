import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid();
const enrollment=z.object({classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid}).strict();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid,canonicalOnly:z.boolean(),enrollments:z.array(enrollment).min(1)}).strict();
const fixture=z.object({students:z.array(actor).length(2),write:z.object({attestation:z.literal("fresh-synthetic-fixture"),personId:uuid,classEnrollmentId:uuid,lessonId:uuid,assignmentId:uuid}).strict().optional()}).strict().refine(f=>{
 const [a,b]=f.students;
 return !!a&&!!b&&a.email!==b.email&&a.personId!==b.personId&&a.grantId!==b.grantId&&a.siteId!==b.siteId&&a.canonicalOnly!==b.canonicalOnly&&
 a.enrollments.every(e=>!b.enrollments.some(x=>x.classEnrollmentId===e.classEnrollmentId||x.courseAttemptId===e.courseAttemptId))&&(!f.write||f.students.some(s=>s.personId===f.write!.personId&&s.enrollments.some(e=>e.classEnrollmentId===f.write!.classEnrollmentId)));
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
       const target=api+"/me/class-enrollments/"+e.classEnrollmentId;
       const resume=await http.get(target+"/resume");expect(resume.status()).toBe(200);
       expect(await resume.json()).toMatchObject({classId:e.classId});
       const assignments=await http.get(target+"/assignments");expect(assignments.status()).toBe(200);
       homework.parse(await assignments.json());
     }
     for(const foreign of fixture.students.filter(s=>s.personId!==student.personId)){
       expect((await http.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:foreign.grantId}})).status()).toBe(403);
       expect((await qaSession(context,"nest")).activeGrantId).toBe(student.grantId);
       for(const e of foreign.enrollments){
         expect(own.classes.some(c=>c.classId===e.classId||c.enrollmentId===e.classEnrollmentId)).toBe(false);
         for(const resource of ["resume","assignments"]){
           const denied=await http.get(api+"/me/class-enrollments/"+e.classEnrollmentId+"/"+resource);
           expect(denied.status()).toBe(403);
           expect((await denied.json()).code).toBe("FORBIDDEN");
         }
       }
     }
     expect((await http.get(api+"/me/class-enrollments/not-a-uuid/resume")).status()).toBe(400);
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
     const completed=await Promise.all([own.post(lesson,{...options,data:{}}),own.post(lesson,{...options,data:{}})]);
     for(const r of completed)expect(r.status()).toBe(200);
     const completions=await Promise.all(completed.map(r=>r.json()));
     expect(completions.every(r=>r.recorded===true)).toBe(true);
     expect(completions.map(r=>r.alreadyCompleted).sort()).toEqual([false,true]);
     const replay=await own.post(lesson,{...options,data:{}});expect(replay.status()).toBe(200);
     expect(await replay.json()).toEqual({recorded:true,alreadyCompleted:true});
     const after=await own.get(target+"/resume");expect(after.status()).toBe(200);
     expect(await after.json()).toMatchObject({completed:progress.completed+1,total:progress.total});
     const submissions=await Promise.all([own.post(assignment,{...options,data:input}),own.post(assignment,{...options,data:input})]);
     for(const r of submissions)expect(r.status()).toBe(200);
     const receipts=await Promise.all(submissions.map(async r=>z.object({submissionId:uuid,alreadySubmitted:z.boolean()}).strict().parse(await r.json())));
     expect(receipts.map(r=>r.alreadySubmitted).sort()).toEqual([false,true]);
     expect(receipts[0]!.submissionId).toBe(receipts[1]!.submissionId);
     const first=receipts[0]!;
     const duplicate=await own.post(assignment,{...options,data:input});expect(duplicate.status()).toBe(200);
     expect(await duplicate.json()).toEqual({submissionId:first.submissionId,alreadySubmitted:true});
     expect((await own.post(assignment,{...options,data:{responseText:"Different response must not overwrite"}})).status()).toBe(403);
     const latest=await own.get(target+"/assignments");expect(latest.status()).toBe(200);
     expect(homework.parse(await latest.json()).assignments.find(a=>a.id===w.assignmentId)?.status).toBe("submitted");
   }
   for(const http of clients.values()){
     const logout=await http.post(api+"/access/logout",{headers:{Origin:origin},data:{}});
     expect(logout.status()).toBe(204);
     expect((await http.get(api+"/access/session")).status()).toBe(401);
     expect((await http.get(api+"/me")).status()).toBe(401);
   }
 } finally {await Promise.all(contexts.map(c=>c.dispose()));}
});
