import {test,expect,type Browser,type Page} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";

// Same standard email-link access and Vite-transformed application RPCs as
// the pilot API journey. Fixture IDs identify existing governed records;
// no SQL writes, role impersonation, or test-only business endpoints.
const origin="http://localhost:5183";
const uuid=z.string().uuid();
const selection=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid}).strict();
const fixture=z.object({
  teacher:selection,student:selection,otherTeacher:selection,
  classId:uuid,otherClassId:uuid,classEnrollmentId:uuid,assignmentId:uuid,
  expectedClassIds:z.array(uuid).min(1),
}).strict().parse(JSON.parse(process.env.CAN_TEACHER_QA_API_FIXTURE_JSON??"{}"));
if(fixture.classId===fixture.otherClassId||!fixture.expectedClassIds.includes(fixture.classId)||
    fixture.expectedClassIds.includes(fixture.otherClassId)||
    new Set([fixture.teacher.email,fixture.student.email,fixture.otherTeacher.email]).size!==3)
  throw Error("Distinct reviewed actors and Classes required");
const modules={
  home:"/src/modules/classes/native-class-teacher-home.functions.ts",
  work:"/src/modules/classes/native-class-teacher-homework.functions.ts",
  learner:"/src/modules/classes/native-class-homework.functions.ts",
} as const;
async function rpc<T>(page:Page,module:keyof typeof modules,name:string,data?:unknown):Promise<T>{
  return page.evaluate(async ({url,name,data})=>{
    const api=await import(/* @vite-ignore */ url);
    if(typeof api[name]!=="function")throw Error("Missing transformed application command");
    return await api[name]({data});
  },{url:modules[module],name,data}) as Promise<T>;
}
async function deny(page:Page,module:keyof typeof modules,name:string,data:unknown){
  const code=await page.evaluate(async({url,name,data})=>{
    const api=await import(/* @vite-ignore */ url);
    if(typeof api[name]!=="function")throw Error("Missing transformed application command");
    try{await api[name]({data});return null;}
    catch(error){return error&&typeof error==="object"&&"code" in error?error.code:null;}
  },{url:modules[module],name,data});
  expect(code).toBe("FORBIDDEN");
}
async function actor(browser:Browser,selected?:z.infer<typeof selection>,role?:string){
  const context=await browser.newContext({baseURL:origin});
  try{
    if(selected){
      const initial=await authenticateQaActor(context,selected.email);
      expect(initial.grants.find(g=>g.id===selected.grantId)?.role).toBe(role);
      if(initial.activeGrantId!==selected.grantId){
        const result=await context.request.post(origin+"/access/session",{headers:{Origin:origin},data:{grantId:selected.grantId}});
        expect(result.ok()).toBe(true);
      }
      expect((await qaSession(context)).activeGrantId).toBe(selected.grantId);
    }
    const page=await context.newPage();
    await page.route(origin+"/__teacher_api_test_context",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><title>Teacher API acceptance</title></html>"}));
    await page.goto(origin+"/__teacher_api_test_context");
    return {context,page};
  }catch(error){await context.close();throw error;}
}
type Dashboard={kind:string;classes:{classId:string;enrollmentCount:number;reviewCount:number;overdueCount:number}[]};
type WorkItem={id:string;status:string;responseText:string;teacherFeedback:string|null;isPracticeSubmission:boolean};
type OverdueItem={classEnrollmentId:string;assignmentId:string;status:string};
async function allPages<T>(page:Page,name:string,classId:string){
  const items:T[]=[];
  let offset=0;
  for(let i=0;i<100;i++){
    const result=await rpc<{items:T[];nextOffset:number|null}>(page,"work",name,{classId,offset});
    items.push(...result.items);
    if(result.nextOffset===null)return items;
    expect(result.nextOffset).toBe(offset+100);
    offset=result.nextOffset;
  }
  throw Error("Teacher QA fixture exceeds bounded pagination");
}
test("ordinary teacher and student APIs reconcile native Class work and deny unrelated access",async({browser})=>{
  const contexts:Awaited<ReturnType<typeof actor>>[]=[];
  try{
    const teacher=await actor(browser,fixture.teacher,"teacher");contexts.push(teacher);
    const student=await actor(browser,fixture.student,"student");contexts.push(student);
    const other=await actor(browser,fixture.otherTeacher,"teacher");contexts.push(other);
    const visitor=await actor(browser);contexts.push(visitor);
    const read=async()=>rpc<Dashboard>(teacher.page,"home","getNativeTeacherToday");
    const directory=await rpc<Dashboard>(teacher.page,"home","getMyNativeTeachingClasses");
    expect(directory.kind).toBe("teacher");
    expect(directory.classes.map(c=>c.classId).sort()).toEqual([...fixture.expectedClassIds].sort());
    const before=await read();
    expect(before.kind).toBe("teacher");
    expect(before.classes.map(c=>c.classId).sort()).toEqual([...fixture.expectedClassIds].sort());
    expect((await rpc<Dashboard>(visitor.page,"home","getNativeTeacherToday")).classes).toEqual([]);
    for(const page of [student.page,other.page,visitor.page])
      await deny(page,"work","getNativeClassTeacherMissingWork",{classId:fixture.classId});
    await deny(teacher.page,"work","getNativeClassTeacherHomework",{classId:fixture.otherClassId});
    const workInput={classEnrollmentId:fixture.classEnrollmentId};
    const learnerWork=await rpc<{assignments:{id:string;status:string;practiceFeedback:string|null}[]}>(student.page,"learner","getNativeClassHomework",workInput);
    const assignment=learnerWork.assignments.find(a=>a.id===fixture.assignmentId);
    expect(assignment).toBeDefined();
    expect(["not_started","assigned","returned"]).toContain(assignment!.status);
    const submitted=await rpc<{submissionId:string;alreadySubmitted:boolean}>(student.page,"learner","submitNativeClassHomework",
      {...workInput,assignmentId:fixture.assignmentId,responseText:"Isolated QA teacher review response."});
    expect(submitted.alreadySubmitted).toBe(false);
    const queue=await allPages<WorkItem>(teacher.page,"getNativeClassTeacherHomework",fixture.classId);
    expect(queue.find(i=>i.id===submitted.submissionId)).toMatchObject({status:"submitted",isPracticeSubmission:true});
    expect(new Set(queue.map(i=>i.id)).size).toBe(queue.length);
    const current=(await read()).classes.find(c=>c.classId===fixture.classId)!;
    expect(current.reviewCount).toBe(queue.filter(i=>i.status==="submitted").length);
    const overdue=await allPages<OverdueItem>(teacher.page,"getNativeClassTeacherMissingWork",fixture.classId);
    expect(current.overdueCount).toBe(overdue.length);
    expect(new Set(overdue.map(i=>i.classEnrollmentId+":"+i.assignmentId)).size).toBe(overdue.length);
    const feedback={classId:fixture.classId,submissionId:submitted.submissionId,feedback:"Please explain your reasoning in more detail.",practiceScore:null};
    await deny(other.page,"work","returnNativeClassPracticeFeedback",feedback);
    expect(await rpc(teacher.page,"work","returnNativeClassPracticeFeedback",feedback)).toMatchObject({status:"returned",practiceOnly:true});
    expect(await rpc(teacher.page,"work","returnNativeClassPracticeFeedback",feedback)).toMatchObject({status:"returned",practiceOnly:true});
    const after=await rpc<{assignments:{id:string;status:string;practiceFeedback:string|null}[]}>(student.page,"learner","getNativeClassHomework",workInput);
    expect(after.assignments.find(a=>a.id===fixture.assignmentId)).toMatchObject({status:"returned",practiceFeedback:feedback.feedback});
    const revised=await rpc<{submissionId:string}>(student.page,"learner","submitNativeClassHomework",
      {...workInput,assignmentId:fixture.assignmentId,responseText:"Isolated QA revised response with a fuller explanation."});
    expect(revised.submissionId).toBe(submitted.submissionId);
    const finalQueue=await allPages<WorkItem>(teacher.page,"getNativeClassTeacherHomework",fixture.classId);
    expect(finalQueue.find(i=>i.id===submitted.submissionId)).toMatchObject({status:"submitted"});
    expect((await read()).classes.find(c=>c.classId===fixture.classId)?.reviewCount).toBe(finalQueue.filter(i=>i.status==="submitted").length);
  }finally{await Promise.all(contexts.map(c=>c.context.close()));}
});
