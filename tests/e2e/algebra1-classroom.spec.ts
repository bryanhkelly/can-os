/**
 * Bite 5: authenticated CAN Algebra I classroom acceptance, real UI -> real
 * server functions -> disposable Neon. This never uses the production ValorSchool
 * tenant or a simulated actor header. Test sessions are normal hashed opaque
 * access_sessions, each bound to a synthetic person grant in an isolated fixture.
 */
import { readFileSync } from "node:fs";
import { expect,test,type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { createGf1Fixture,destroyGf1Fixture,type Gf1Fixture,type Sql } from "./fixture";
import { createAccessSession,withAuthenticatedPage } from "./helpers/authenticated-persona";
import { createSyntheticPersonaGrant,createVerifiedAccessAccount } from "./helpers/canonical-fixture";
import { expectAuditActionGroups } from "./helpers/evidence-assertions";
import { expectProtectedPageDenied } from "./helpers/golden-flow-assertions";
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


type AdoptionBrowserFixture={
 packId:string;packVersionId:string;adoptionId?:string;entitlementId?:string;
 registrarPersonId:string;accountId:string;grantId:string;roleAssignmentId:string;
 registrarSecret:string;packName:string;
};
let adoptionBrowser:AdoptionBrowserFixture|undefined;

/** A real school account and a foreign publisher pack, in the disposable DB only. */
async function prepareSchoolMarketplace(){
 if(!fixture)throw new Error("Missing isolated acceptance fixture.");
 const f=fixture, suffix=f.suffix;
 const one=async(query:string,args:unknown[]):Promise<string>=>{
  const result=dbRows<{id:string}>(await sql.query(query,args));
  if(!result[0]?.id)throw new Error("Missing browser fixture id");
  return result[0].id;
 };
 const packName=`Publisher Algebra I ${suffix}`;
 const packId=await one(`INSERT INTO curriculum_packs
  (publisher_organization_id,slug,name,description,visibility,license_code)
  VALUES($1,$2,$3,'Third-party E2E publisher Algebra I','public','CC-BY-4.0') RETURNING id`,
  [f.canOrgId,`algebra-e2e-${suffix}`,packName]);
 const packVersionId=await one(`INSERT INTO curriculum_pack_versions
  (pack_id,version,status,published_at) VALUES($1,1,'published',now()) RETURNING id`,[packId]);
 await sql.query(`INSERT INTO curriculum_pack_items
  (pack_version_id,course_template_version_id,position) VALUES($1,$2,1)`,
  [packVersionId,f.courseTemplateVersionId]);
 const registrarPersonId=await one(`INSERT INTO people
  (legal_first_name,legal_last_name,email,metadata) VALUES
  ('E2E School','Curriculum Adopter',$1,'{"synthetic":true}'::jsonb) RETURNING id`,
  [`e2e-adopter-${suffix}@can-os.invalid`]);
 await sql.query(`INSERT INTO memberships (person_id,organization_id) VALUES($1,$2)`,
  [registrarPersonId,f.hostOrgId]);
 const roleAssignmentId=await one(`INSERT INTO role_assignments
  (person_id,organization_id,site_id,program_id,role_key,capabilities)
  VALUES($1,$2,$3,$4,'curriculum_adopter','["curriculum.adopt"]'::jsonb)
  RETURNING id`,[registrarPersonId,f.hostOrgId,f.siteId,f.programId]);
 const accountId=await createVerifiedAccessAccount(sql,`e2e-adopter-${suffix}@can-os.invalid`);
 const grantId=await createSyntheticPersonaGrant(sql,{
  accountId,personId:registrarPersonId,role:"registrar",organizationId:f.hostOrgId,siteId:f.siteId,
 });
 const registrarSecret=await createAccessSession(sql,{
  accountId,activeGrantId:grantId,expiresAt:new Date(Date.now()+12*3600_000),
 });
 adoptionBrowser={packId,packVersionId,registrarPersonId,accountId,grantId,
  roleAssignmentId,registrarSecret,packName};
}

async function cleanupSchoolMarketplace(){
 const a=adoptionBrowser;
 if(!a)return;
 const firstRows=dbRows<{id:string}>(await sql.query(`SELECT id FROM curriculum_adoptions
  WHERE pack_id=$1`,[a.packId]));
 const secondRows=dbRows<{id:string}>(await sql.query(`SELECT id FROM curriculum_entitlements
  WHERE pack_id=$1`,[a.packId]));
 const ids=[...firstRows.map(x=>x.id),...secondRows.map(x=>x.id),a.packId,a.packVersionId];
 await sql.query(`DELETE FROM domain_events WHERE aggregate_id=ANY($1::uuid[])`,[ids]);
 await sql.query(`DELETE FROM audit_events WHERE resource_id=ANY($1::uuid[])`,[ids]);
 await sql.query(`DELETE FROM curriculum_adoptions WHERE pack_id=$1`,[a.packId]);
 await sql.query(`DELETE FROM curriculum_entitlements WHERE pack_id=$1`,[a.packId]);
 await sql.query(`DELETE FROM curriculum_pack_items WHERE pack_version_id=$1`,[a.packVersionId]);
 await sql.query(`DELETE FROM curriculum_pack_versions WHERE id=$1`,[a.packVersionId]);
 await sql.query(`DELETE FROM curriculum_packs WHERE id=$1`,[a.packId]);
 await sql.query(`DELETE FROM access_sessions WHERE account_id=$1`,[a.accountId]);
 await sql.query(`DELETE FROM account_person_grants WHERE id=$1`,[a.grantId]);
 await sql.query(`DELETE FROM access_accounts WHERE id=$1`,[a.accountId]);
 await sql.query(`DELETE FROM role_assignments WHERE id=$1`,[a.roleAssignmentId]);
 await sql.query(`DELETE FROM memberships WHERE person_id=$1`,[a.registrarPersonId]);
 await sql.query(`DELETE FROM people WHERE id=$1`,[a.registrarPersonId]);
 adoptionBrowser=undefined;
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
 try{await installCurriculum();await prepareSchoolMarketplace();}
 catch(error){await cleanupSchoolMarketplace().catch(()=>{});
  await cleanupCurriculum().catch(()=>{});await destroyGf1Fixture(sql,fixture);fixture=undefined;throw error;}
});
test.afterAll(async()=>{
 if(!fixture)return;
 try{await cleanupSchoolMarketplace();}
 finally{try{await cleanupCurriculum();}finally{await destroyGf1Fixture(sql,fixture);}}
});

test("Algebra I: student lessons and submissions -> teacher guide and rubric grades -> student feedback",async({browser})=>{
 const f=fixture!;
 const a=adoptionBrowser!;
 await withAuthenticatedPage(browser,a.registrarSecret,async registrar=>{
  await test.step("school registrar installs and adopts a different publisher's public curriculum",async()=>{
   await registrar.page.goto(`/operations/curriculum-marketplace?programId=${f.programId}`);
   await expect(registrar.page.getByRole("heading",{name:"Curriculum Marketplace"})).toBeVisible();
   const publisherPack=registrar.page.locator("article").filter({has:registrar.page.getByRole("heading",{name:a.packName})});
   await expect(publisherPack.getByText("1 published course versions")).toBeVisible();
   await publisherPack.getByRole("checkbox").check();
   await publisherPack.getByRole("button",{name:"Add to library"}).click();
   await expect.poll(async()=>dbRows<{id:string}>(await sql.query(
    `SELECT id FROM curriculum_entitlements WHERE pack_id=$1 AND organization_id=$2 AND status='active'`,
    [a.packId,f.hostOrgId])).length).toBe(1);
   await publisherPack.getByRole("button",{name:"Review adoption"}).click();
   await expect(publisherPack.getByText("Confirm curriculum adoption")).toBeVisible();
   await publisherPack.getByRole("checkbox",{name:/I reviewed the publisher/}).check();
   await publisherPack.getByRole("button",{name:"Adopt for this program"}).click();
   await expect(publisherPack.getByText(/Release v1 adopted/)).toBeVisible();
   await expect.poll(async()=>dbRows<{id:string}>(await sql.query(
    `SELECT id FROM curriculum_adoptions WHERE program_id=$1 AND pack_id=$2
      AND pack_version_id=$3 AND status='active'`,
    [f.programId,a.packId,a.packVersionId])).length).toBe(1);
   await expect(registrar.page.getByRole("region",{name:"Curriculum operational evidence"}))
    .toContainText("Classes using adopted publisher courses");
   // Adoption is permission to USE curriculum, not permission to author it.
   await expect(registrar.page.getByRole("link",{name:"Curriculum Studio"})).toHaveCount(0);
   await expect(registrar.page.getByRole("heading",{name:"Import Common Cartridge"})).toHaveCount(0);
  });
 },"http://localhost:3188");
 await withAuthenticatedPage(browser,f.studentSecret,async student=>{
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
   await expectProtectedPageDenied(student.page,`/classes?section=${f.sectionId}&tab=teacher-guide`,{
    denial:student.page.getByText("Teacher-only materials are unavailable"),
    protectedContent:["Assessment answer guides"],
   });
   await expect(student.page.getByRole("link",{name:"Teacher guide"})).toHaveCount(0);
  });
 },"http://localhost:3188");

 await withAuthenticatedPage(browser,f.guardianSecret,async guardian=>{
  await test.step("authorized guardian can view the child class but not teacher answers",async()=>{
   await expectProtectedPageDenied(guardian.page,
    `/classes?section=${f.sectionId}&student=${f.studentPersonId}&tab=teacher-guide`,{
    denial:guardian.page.getByText("Teacher-only materials are unavailable"),
    protectedContent:["Assessment answer guides"],
   });
   await expect(guardian.page.getByRole("link",{name:"Teacher guide"})).toHaveCount(0);
  });
 },"http://localhost:3188");

 await withAuthenticatedPage(browser,f.specialistSecret,async unrelated=>{
  await test.step("unrelated specialist cannot load the Algebra I class or answer guide",async()=>{
   await expectProtectedPageDenied(unrelated.page,`/classes?section=${f.sectionId}&tab=teacher-guide`,{
    denial:unrelated.page.getByText("Sign in with an authorized student, parent or teacher account to open classes."),
    protectedContent:["Assessment answer guides"],
   });
  });
 },"http://localhost:3188");

 await withAuthenticatedPage(browser,f.teacherSecret,async teacher=>{
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
 },"http://localhost:3188");

 await withAuthenticatedPage(browser,f.studentSecret,async again=>{
  await test.step("student sees both posted grades and teacher feedback",async()=>{
   await again.page.goto(`/classes?section=${f.sectionId}`);
   await expect(again.page.getByText(/2 graded/)).toBeVisible();
   await openStudentAssignment(again.page,f.assessmentId,unit.assessments[0]!.title);
   await expect(again.page.getByText(/Week 1 practice feedback/)).toBeVisible();
   await expect(again.page.getByText(/18.*20/).first()).toBeVisible();
   await openStudentAssignment(again.page,extraAssessmentId!,unit.assessments[1]!.title);
   await expect(again.page.getByText(/Week 1 checkpoint feedback/)).toBeVisible();
   await expect(again.page.getByText(/27.*30/).first()).toBeVisible();
   const firstSubmission=await latest(f.assessmentId);
   const secondSubmission=await latest(extraAssessmentId!);
   if(!firstSubmission||!secondSubmission)throw new Error("Missing graded submission evidence");
   await expectAuditActionGroups(sql,{
    resourceType:"submission",resourceIds:[firstSubmission.id,secondSubmission.id],
    groups:[["assignment.submit","submission.submit"],["assignment.grade","submission.grade"]],
   });
  });
 },"http://localhost:3188");
});
