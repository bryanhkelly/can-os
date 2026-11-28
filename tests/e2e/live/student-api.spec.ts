import {test,expect,type BrowserContext,type Page} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
import {pilotRpcPage,pilotRpc as rpc,expectPilotDenial as deny} from "../helpers/pilot-governed-rpc";

const uuid=z.string().uuid();
const enrollment=z.object({classId:uuid,classEnrollmentId:uuid,courseAttemptId:uuid}).strict();
const actor=z.object({
 email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),
 grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid,
 canonicalOnly:z.boolean(),enrollments:z.array(enrollment).min(1),
}).strict();
const fixture=z.object({
 students:z.array(actor).length(2),
 write:z.object({attestation:z.literal("fresh-synthetic-fixture"),personId:uuid,classEnrollmentId:uuid,lessonId:uuid,assignmentId:uuid}).strict().optional(),
}).strict().refine(f=>{
 const [a,b]=f.students;
 return a.email!==b.email&&a.personId!==b.personId&&a.grantId!==b.grantId&&a.siteId!==b.siteId&&
  a.canonicalOnly!==b.canonicalOnly&&a.enrollments.every(e=>!b.enrollments.some(x=>x.classEnrollmentId===e.classEnrollmentId||x.courseAttemptId===e.courseAttemptId))&&
  (!f.write||f.students.some(s=>s.personId===f.write!.personId&&s.enrollments.some(e=>e.classEnrollmentId===f.write!.classEnrollmentId)));
},"Use distinct reviewed school and canonical-only student fixtures at two Sites").parse(JSON.parse(process.env.CAN_STUDENT_QA_JSON??"{}"));
const today=z.object({student:z.object({personId:uuid,studentProfileId:uuid.nullable()}),sections:z.array(z.unknown())});
const classes=z.object({kind:z.literal("student"),classes:z.array(z.object({classId:uuid,enrollmentId:uuid.nullable(),courseAttemptId:uuid.nullable(),status:z.string()}))});
const homework=z.object({assignments:z.array(z.object({id:uuid,status:z.string()}))});
const lessonWork=z.object({lessons:z.array(z.object({lessonId:uuid,progressStatus:z.string().nullable()}))});
const denied=["FORBIDDEN","AUTHENTICATION_REQUIRED"];

test("ordinary student sessions exercise canonical student lifecycle and deny foreign enrollment access",async({browser})=>{
 const contexts:BrowserContext[]=[];
 const pages=new Map<string,Page>();
 try{
  const anonymous=await browser.newContext();contexts.push(anonymous);
  const publicPage=await pilotRpcPage(anonymous);
  await deny(publicPage,"studentToday","getMyStudentToday",undefined,denied);
  expect(await rpc(publicPage,"studentClasses","getMyStudentClasses")).toMatchObject({kind:"other",classes:[]});
  for(const student of fixture.students){
   const context=await browser.newContext();contexts.push(context);
   const initial=await authenticateQaActor(context,student.email);
   const grant=initial.grants.find(g=>g.id===student.grantId);
   expect(grant).toMatchObject({role:"student",personId:student.personId,organizationId:student.organizationId,siteId:student.siteId});
   if(initial.activeGrantId!==student.grantId){
    const switched=await context.request.post("http://localhost:5183/access/session",{headers:{Origin:"http://localhost:5183"},data:{grantId:student.grantId}});
    expect(switched.ok()).toBe(true);
   }
   expect((await qaSession(context)).activeGrantId).toBe(student.grantId);
   const page=await pilotRpcPage(context);pages.set(student.personId,page);
   const day=today.parse(await rpc(page,"studentToday","getMyStudentToday"));
   expect(day.student.personId).toBe(student.personId);
   if(student.canonicalOnly){expect(day.student.studentProfileId).toBeNull();expect(day.sections).toEqual([]);}
   else expect(day.student.studentProfileId).not.toBeNull();
   const own=classes.parse(await rpc(page,"studentClasses","getMyStudentClasses"));
   const active=own.classes.filter(c=>c.status==="active");
   expect(active.map(c=>c.enrollmentId).sort()).toEqual(student.enrollments.map(c=>c.classEnrollmentId).sort());
   for(const enrolled of student.enrollments){
    expect(active.find(c=>c.enrollmentId===enrolled.classEnrollmentId)).toMatchObject({classId:enrolled.classId,courseAttemptId:enrolled.courseAttemptId});
    const data={classEnrollmentId:enrolled.classEnrollmentId};
    expect(await rpc(page,"studentLearning","getNativeClassLearningResume",data)).toMatchObject({classId:enrolled.classId});
    expect(await rpc(page,"studentLearning","getNativeClassLearning",data)).toMatchObject({classId:enrolled.classId,courseAttemptId:enrolled.courseAttemptId});
    homework.parse(await rpc(page,"studentHomework","getNativeClassHomeworkSummary",data));
   }
   const foreign=fixture.students.find(s=>s.personId!==student.personId)!;
   for(const e of foreign.enrollments){
    expect(own.classes.some(c=>c.enrollmentId===e.classEnrollmentId||c.classId===e.classId)).toBe(false);
    const data={classEnrollmentId:e.classEnrollmentId};
    await deny(page,"studentLearning","getNativeClassLearningResume",data,denied);
    await deny(page,"studentLearning","getNativeClassLearning",data,denied);
    await deny(page,"studentHomework","getNativeClassHomeworkSummary",data,denied);
   }
  }
  // Only a manifest-attested fresh synthetic fixture can perform positive writes.
  if(fixture.write){
   const w=fixture.write,page=pages.get(w.personId)!;
   const other=fixture.students.find(s=>s.personId!==w.personId)!;
   const foreign=pages.get(other.personId)!;
   const target={classEnrollmentId:w.classEnrollmentId};
   const lesson={...target,lessonId:w.lessonId};
   const submission={...target,assignmentId:w.assignmentId,responseText:"Synthetic QA practice answer"};
   const before=lessonWork.parse(await rpc(page,"studentLearning","getNativeClassLearning",target));
   expect(before.lessons.find(l=>l.lessonId===w.lessonId)).toBeDefined();
   expect(["completed","waived"]).not.toContain(before.lessons.find(l=>l.lessonId===w.lessonId)?.progressStatus);
   expect(homework.parse(await rpc(page,"studentHomework","getNativeClassHomeworkSummary",target)).assignments.find(a=>a.id===w.assignmentId)?.status).toBe("not_started");
   await deny(foreign,"studentLearning","markNativeClassLessonComplete",lesson,denied);
   await deny(foreign,"studentHomework","submitNativeClassHomework",submission,denied);
   expect(await rpc(page,"studentLearning","markNativeClassLessonComplete",lesson)).toEqual({recorded:true,alreadyCompleted:false});
   expect(await rpc(page,"studentLearning","markNativeClassLessonComplete",lesson)).toEqual({recorded:true,alreadyCompleted:true});
   const after=lessonWork.parse(await rpc(page,"studentLearning","getNativeClassLearning",target));
   expect(after.lessons.find(l=>l.lessonId===w.lessonId)?.progressStatus).toBe("completed");
   const first=z.object({submissionId:uuid,alreadySubmitted:z.literal(false)}).parse(await rpc(page,"studentHomework","submitNativeClassHomework",submission));
   expect(await rpc(page,"studentHomework","submitNativeClassHomework",submission)).toEqual({submissionId:first.submissionId,alreadySubmitted:true});
   expect(homework.parse(await rpc(page,"studentHomework","getNativeClassHomeworkSummary",target)).assignments.find(a=>a.id===w.assignmentId)?.status).toBe("submitted");
   await deny(page,"studentHomework","submitNativeClassHomework",{...submission,responseText:"Different answer after submission"},denied);
  }else test.info().annotations.push({type:"coverage",description:"Read and denial coverage only; no fresh synthetic positive-write fixture supplied."});
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
