import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid();
const enrollment=z.object({classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid}).strict();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid,canonicalOnly:z.boolean(),enrollments:z.array(enrollment).min(1)}).strict();
const fixture=z.object({students:z.array(actor).length(2),write:z.unknown().optional()}).strict().refine(f=>{
 const [a,b]=f.students;
 return !!a&&!!b&&a.email!==b.email&&a.personId!==b.personId&&a.grantId!==b.grantId&&a.siteId!==b.siteId&&a.canonicalOnly!==b.canonicalOnly&&
 a.enrollments.every(e=>!b.enrollments.some(x=>x.classEnrollmentId===e.classEnrollmentId||x.courseAttemptId===e.courseAttemptId));
},"Two distinct reviewed students and Sites required").parse(JSON.parse(process.env.CAN_STUDENT_QA_JSON??"{}"));
const api="http://localhost:3001/api/v1";
const access="http://localhost:5183";
const classes=z.object({kind:z.literal("student"),classes:z.array(z.object({classId:uuid,enrollmentId:uuid.nullable(),courseAttemptId:uuid.nullable(),status:z.string()}))});
const homework=z.object({assignments:z.array(z.object({id:uuid,title:z.string(),status:z.string(),dueAt:z.string().nullable(),submittedAt:z.string().nullable()}).strict())}).strict();

test("independent standard HTTP client validates both students and rejects foreign enrollment resources",async()=>{
 const contexts:APIRequestContext[]=[];
 async function client(){const context=await request.newContext();contexts.push(context);return context;}
 try {
   const anonymous=await client();
   expect((await anonymous.get(api+"/me")).status()).toBe(401);
   for(const student of fixture.students){
     const http=await client(), context={request:http};
     const session=await authenticateQaActor(context,student.email);
     expect(session.grants.find(g=>g.id===student.grantId)).toMatchObject({role:"student",personId:student.personId,siteId:student.siteId,organizationId:student.organizationId});
     if(session.activeGrantId!==student.grantId){
       expect((await http.post(access+"/access/session",{headers:{Origin:access},data:{grantId:student.grantId}})).status()).toBe(200);
     }
     expect((await qaSession(context)).activeGrantId).toBe(student.grantId);
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
 } finally {await Promise.all(contexts.map(c=>c.dispose()));}
});
