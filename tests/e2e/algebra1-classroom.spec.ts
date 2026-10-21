/**
 * Bite 5: authenticated CAN Algebra I classroom acceptance, real UI -> real
 * server functions -> disposable Neon. This never uses the production ValorSchool
 * tenant or a simulated actor header. Test sessions are normal hashed opaque
 * access_sessions, each bound to a synthetic person grant in an isolated fixture.
 */
import { readFileSync } from "node:fs";
import { expect,test,type Browser,type BrowserContext,type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { accessSessionCookie,createGf1Fixture,destroyGf1Fixture,type Gf1Fixture,type Sql } from "./fixture";
import { DATABASE_URL } from "./env";

type Unit={
 unitId:string;title:string;
 lessons:Array<{id:string;title:string;activities:Array<{kind:string}>}>;
 assessments:Array<{key:string;title:string;pointsPossible:number;instructions:string;
  rubricCriteria:Array<{id:string;label:string;maxPoints:number;description:string}>}>;
};
const unit=JSON.parse(readFileSync(new URL(
 "../../curriculum/can-high-school-core/algebra1/unit01-week01.json",import.meta.url),"utf8")) as Unit;
const guide=JSON.parse(readFileSync(new URL(
 "../../curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json",import.meta.url),"utf8"));
const blueprint=JSON.parse(readFileSync(new URL(
 "../../curriculum/can-high-school-core/algebra1/yearlong-blueprint.json",import.meta.url),"utf8"));

let sql:Sql;
let fixture:Gf1Fixture|undefined;
let extraAssessmentId:string|undefined;

const dbRows=<T>(value:unknown)=>value as T[];
async function signedIn(browser:Browser,secret:string){
 const context=await browser.newContext({baseURL:"http://localhost:3188"});
 // The existing fixture creates hashed server-side sessions with student or teacher
 // grants; only the opaque secret crosses into the corresponding browser.
 await context.addCookies([{
  name:accessSessionCookie,value:secret,url:"http://localhost:3188",
  path:"/",httpOnly:true,secure:true,sameSite:"Lax",
 }]);
 return {context,page:await context.newPage()};
}
async function installCurriculum(){
 if(!fixture)throw new Error("Missing isolated fixture");
 const f=fixture;
 const curriculum={
  learning:{version:1,syllabus:"Synthetic Algebra I Week 1; development only, not graduation credit.",
   blueprint,modules:[{id:unit.unitId,title:unit.title,lessons:unit.lessons}],resources:[]},
  teacherGuides:{...guide,courseCode:"CAN-ALG1"},
 };
 // Only data created in this isolated run may be changed; never query the
 // production ValorSchool section, course or account IDs.
 await sql.query(`UPDATE course_templates SET code='CAN-ALG1',title='Algebra I',subject='Mathematics'
  WHERE id=$1 AND owning_organization_id=$2`,[f.courseTemplateId,f.canOrgId]);
 await sql.query(`UPDATE course_template_versions SET curriculum=$2::jsonb
  WHERE id=$1 AND course_template_id=$3 AND status='published'`,
  [f.courseTemplateVersionId,JSON.stringify(curriculum),f.courseTemplateId]);
 await sql.query(`UPDATE sections SET title='Algebra I',code=$2,metadata='{"synthetic":true,"bite5":true}'::jsonb
  WHERE id=$1`,[f.sectionId,`CAN-ALG1-${f.suffix}`]);

 const first=unit.assessments[0]!;
 const second=unit.assessments[1]!;
 await sql.query(`UPDATE assessments SET title=$2,instructions=$3,points_possible=$4,
 status='published',due_at=$5,available_at=now(),metadata=$6::jsonb
 WHERE id=$1 AND section_id=$7`,[
  f.assessmentId,first.title,first.instructions,first.pointsPossible,
  new Date(Date.now()+7*24*3600_000).toISOString(),
  JSON.stringify({synthetic:true,unitId:unit.unitId,rubricCriteria:first.rubricCriteria}),
  f.sectionId,
 ]);
 extraAssessmentId=randomUUID();
 await sql.query(`INSERT INTO assessments
  (id,section_id,title,instructions,status,points_possible,available_at,due_at,
    created_by_person_id,metadata)
  VALUES($1,$2,$3,$4,'published',$5,now(),$6,$7,$8::jsonb)`,[
  extraAssessmentId,f.sectionId,second.title,second.instructions,
  second.pointsPossible,new Date(Date.now()+7*24*3600_000).toISOString(),
  f.teacherPersonId,
  JSON.stringify({synthetic:true,unitId:unit.unitId,rubricCriteria:second.rubricCriteria}),
 ]);
}

async function cleanupCurriculum(){
 if(!fixture)return;
 const f=fixture;
 const ids=[f.assessmentId,...(extraAssessmentId?[extraAssessmentId]:[])];
 const submissions=dbRows<{id:string}>(await sql.query(`SELECT id FROM submissions WHERE assessment_id=ANY($1::uuid[])`,[ids]));
 const progress=dbRows<{id:string}>(await sql.query(`SELECT id FROM lesson_progress WHERE section_id=$1`,[f.sectionId]));
 const sideEffects=[...ids,...submissions.map(s=>s.id),...progress.map(p=>p.id)];
 if(sideEffects.length){
  await sql.query(`DELETE FROM domain_events WHERE aggregate_id=ANY($1::uuid[])`,[sideEffects]);
  await sql.query(`DELETE FROM audit_events WHERE resource_id=ANY($1::uuid[])`,[sideEffects]);
 }
 await sql.query(`DELETE FROM lesson_progress WHERE section_id=$1`,[f.sectionId]);
 await sql.query(`DELETE FROM submissions WHERE assessment_id=ANY($1::uuid[])`,[ids]);
 if(extraAssessmentId)await sql.query(`DELETE FROM assessments WHERE id=$1`,[extraAssessmentId]);
}

async function latest(assessmentId:string){
 const rows=dbRows<{id:string;status:string;score:string|null;feedback:{comment?:string}}>(
  await sql.query(`SELECT id,status,score::text AS score,feedback FROM submissions
   WHERE assessment_id=$1 AND student_profile_id=$2 ORDER BY attempt_number DESC LIMIT 1`,
  [assessmentId,fixture!.studentProfileId]));
 return rows[0]??null;
}
async function openStudentAssignment(page:Page,assessmentId:string,title:string){
 await page.goto(`/student/assignments?section=${fixture!.sectionId}&assessment=${assessmentId}`);
 await expect(page.getByRole("region",{name:"Assignment details"})
  .getByRole("heading",{name:title})).toBeVisible();
}
async function scoreInTeacherGradebook(page:Page,assessmentId:string,criterionPoints:number[],feedback:string){
 const f=fixture!;
 await page.goto(`/teacher/gradebook?section=${f.sectionId}&assessment=${assessmentId}&student=${f.studentProfileId}`);
 const title=assessmentId===f.assessmentId?unit.assessments[0]!.title:unit.assessments[1]!.title;
 await expect(page.getByRole("heading",{name:new RegExp(title.replaceAll(/[.*+?^${}()|[\]\\]/g,"\\$&"))})).toBeVisible();
 const criteria=assessmentId===f.assessmentId?unit.assessments[0]!.rubricCriteria:unit.assessments[1]!.rubricCriteria;
 for(let i=0;i<criteria.length;i++){
  await page.getByLabel(criteria[i]!.label,{exact:false}).fill(String(criterionPoints[i]));
 }
 await page.getByLabel("Feedback comment").fill(feedback);
 await page.getByRole("button",{name:"Post grade"}).click();
 await expect.poll(async()=>(await latest(assessmentId))?.status).toBe("graded");
 const row=await latest(assessmentId);
 expect(Number(row?.score)).toBe(criterionPoints.reduce((a,b)=>a+b,0));
 expect(row?.feedback.comment).toContain(feedback);
}
test.beforeAll(async()=>{
 if(!DATABASE_URL||DATABASE_URL!==process.env.TEST_DATABASE_URL ||
  process.env.APP_ENV!=="test" || process.env.NODE_ENV!=="test" ||
  process.env.CAN_TEST_DB_WRITES_ENABLED!=="true")
  throw new Error("Use the strict isolated Algebra I browser config, never a production URL.");
 sql=neon(DATABASE_URL);
 fixture=await createGf1Fixture(sql);
 try{await installCurriculum();}
 catch(error){await cleanupCurriculum().catch(()=>{});await destroyGf1Fixture(sql,fixture);fixture=undefined;throw error;}
});
test.afterAll(async()=>{
 if(!fixture)return;
 try{await cleanupCurriculum();}
 finally{await destroyGf1Fixture(sql,fixture);}
});

test("Algebra I: student lessons and submissions -> teacher guide and rubric grades -> student feedback",async({browser})=>{
 const f=fixture!;
 const student=await signedIn(browser,f.studentSecret);
 try{
  await test.step("real enrolled student sees five published lessons and the 36-week planning boundary",async()=>{
   await student.page.goto(`/classes?section=${f.sectionId}`);
   await expect(student.page.getByText("Yearlong course roadmap")).toBeVisible();
   await expect(student.page.getByText(/1 of 36 weeks authored/)).toBeVisible();
   await expect(student.page.getByText(/not certified as credit-ready/)).toBeVisible();
   await student.page.goto(`/classes?section=${f.sectionId}&tab=lessons`);
   for(const lesson of unit.lessons){
    await expect(student.page.getByRole("link",{name:new RegExp(lesson.title.replaceAll(/[.*+?^${}()|[\]\\]/g,"\\$&"))})).toBeVisible();
   }
   const response=await student.page.goto(`/classes?section=${f.sectionId}&tab=lessons&lesson=u01-d01`);
   await expect(student.page.getByRole("heading",{name:/Guided Practice/})).toBeVisible();
   await expect(student.page.getByRole("heading",{name:/Independent Practice/})).toBeVisible();
   await expect(student.page.getByText("Mark lesson complete")).toBeVisible();
   expect((await response!.text())).not.toContain("Assessment answer guides");
   expect((await response!.text())).not.toContain("A learner may combine unlike terms");
   await student.page.getByRole("button",{name:"Mark lesson complete"}).click();
   await expect.poll(async()=>dbRows<{completed_at:string}>(await sql.query(
    `SELECT completed_at::text FROM lesson_progress
      WHERE section_id=$1 AND student_profile_id=$2 AND lesson_id='u01-d01'`,
    [f.sectionId,f.studentProfileId])).length).toBe(1);
  });
  await test.step("student submits both graded tasks through real assignment UI",async()=>{
   for(const [index,a] of unit.assessments.entries()){
    const id=index===0?f.assessmentId:extraAssessmentId!;
    await openStudentAssignment(student.page,id,a.title);
    await student.page.getByPlaceholder("Write your response…").fill(
     `Synthetic Week 1 response ${index+1}: let x describe the unknown, solve using inverse operations, substitute and check.`);
    await student.page.getByRole("button",{name:"Submit assignment"}).click();
    await expect.poll(async()=>(await latest(id))?.status).toBe("submitted");
   }
  });
  await test.step("student receives no teacher-only answer guide",async()=>{
   await student.page.goto(`/classes?section=${f.sectionId}&tab=teacher-guide`);
   await expect(student.page.getByText("Teacher-only materials are unavailable")).toBeVisible();
   await expect(student.page.getByRole("link",{name:"Teacher guide"})).toHaveCount(0);
  });
 }finally{await student.context.close();}

 const guardian=await signedIn(browser,f.guardianSecret);
 try {
  await test.step("authorized guardian can view the child class but not teacher answers",async()=>{
   const response=await guardian.page.goto(`/classes?section=${f.sectionId}&student=${f.studentPersonId}&tab=teacher-guide`);
   await expect(guardian.page.getByText("Teacher-only materials are unavailable")).toBeVisible();
   expect((await response!.text())).not.toContain("Assessment answer guides");
   await expect(guardian.page.getByRole("link",{name:"Teacher guide"})).toHaveCount(0);
  });
 }finally{await guardian.context.close();}

 const unrelated=await signedIn(browser,f.specialistSecret);
 try {
  await test.step("unrelated specialist cannot load the Algebra I class or answer guide",async()=>{
   const response=await unrelated.page.goto(`/classes?section=${f.sectionId}&tab=teacher-guide`);
   await expect(unrelated.page.getByText("Sign in with an authorized student, parent or teacher account to open classes.")).toBeVisible();
   expect((await response!.text())).not.toContain("Assessment answer guides");
  });
 }finally{await unrelated.context.close();}

 const teacher=await signedIn(browser,f.teacherSecret);
 try{
  await test.step("only the assigned teacher sees worked answers and interventions",async()=>{
   await teacher.page.goto(`/classes?section=${f.sectionId}&tab=teacher-guide`);
   await expect(teacher.page.getByText("Assessment answer guides")).toBeVisible();
   await teacher.page.locator("details").first().locator("summary").click();
   await expect(teacher.page.getByText("Common misconceptions")).toBeVisible();
   await expect(teacher.page.getByText("Interventions")).toBeVisible();
  });
  await test.step("teacher rubric-grades both actual submissions",async()=>{
   await scoreInTeacherGradebook(teacher.page,f.assessmentId,[6,7,5],
    "Week 1 practice feedback: improve your inverse-operation explanation.");
   await scoreInTeacherGradebook(teacher.page,extraAssessmentId!,[5,9,9,4],
    "Week 1 checkpoint feedback: explain the inequality boundary.");
  });
 }finally{await teacher.context.close();}

 const again=await signedIn(browser,f.studentSecret);
 try{
  await test.step("student sees both posted grades and teacher feedback",async()=>{
   await again.page.goto(`/classes?section=${f.sectionId}`);
   await expect(again.page.getByText(/2 graded/)).toBeVisible();
   await openStudentAssignment(again.page,f.assessmentId,unit.assessments[0]!.title);
   await expect(again.page.getByText(/Week 1 practice feedback/)).toBeVisible();
   await expect(again.page.getByText(/18.*20/).first()).toBeVisible();
   await openStudentAssignment(again.page,extraAssessmentId!,unit.assessments[1]!.title);
   await expect(again.page.getByText(/Week 1 checkpoint feedback/)).toBeVisible();
   await expect(again.page.getByText(/27.*30/).first()).toBeVisible();
   const audit=dbRows<{action:string}>(await sql.query(
    `SELECT action FROM audit_events WHERE resource_id IN
      (SELECT id FROM submissions WHERE assessment_id=ANY($1::uuid[]))
      AND (action LIKE '%submit%' OR action LIKE '%grade%')`,[[f.assessmentId,extraAssessmentId!]]));
   expect(audit.some(x=>x.action.includes("submit"))).toBe(true);
   expect(audit.some(x=>x.action.includes("grade"))).toBe(true);
  });
 }finally{await again.context.close();}
});
