import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq, SQL } from "drizzle-orm";
import * as s from "@/db/schema";
const state=vi.hoisted(()=>({role:"teacher",client:null as unknown as import("@electric-sql/pglite").PGlite}));
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
  validator:(parse:(v:unknown)=>unknown)=>({handler:(fn:(v:unknown)=>unknown)=>async(arg:{data:unknown})=>fn({data:parse(arg.data)})}),
  handler:(fn:unknown)=>fn,
})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>({
  role:state.role,actorPersonId:state.role==="teacher"?"10000000-0000-4000-8000-000000000001":state.role==="guardian"?"10000000-0000-4000-8000-000000000011":"10000000-0000-4000-8000-000000000002",
  capabilities:new Set(["assignments:create","assignments:grade","assignments:submit","student:related-read","program.read"]),
  scope:{siteIds:["10000000-0000-4000-8000-000000000003"],programIds:["10000000-0000-4000-8000-000000000004"],organizationIds:["10000000-0000-4000-8000-000000000012"]},
})}));
// Session/authority and object storage boundaries have separate regressions.
// This case connects real command SQL and persisted evidence in disposable Postgres.
vi.mock("@/modules/learning/class-access.server",()=>({
  authorizeClass:async()=>({studentProfileId:"10000000-0000-4000-8000-000000000005"}),
  accessibleClasses:async()=>[{id:"10000000-0000-4000-8000-000000000006"}],
}));
vi.mock("@/platform/mutation",()=>({writeAudit:vi.fn(),emitEvent:vi.fn(),notify:vi.fn()}));
vi.mock("@/platform/storage/r2",()=>({signPrivateObjectUrl:()=>"https://isolated.test/object",verifyPrivateObject:vi.fn()}));
vi.mock("@/db/client",async()=>{
  const {PGlite}=await import("@electric-sql/pglite");
  const {drizzle}=await import("drizzle-orm/pglite");
  state.client=new PGlite();
  return {db:drizzle(state.client)};
});
import {db} from "@/db/client";
import {createAssessment,getGradebook,getSubmissionReview,gradeSubmission,manageAssessment} from "@/modules/learning/gradebook.functions";
import {getGuardianAssignments} from "@/modules/learning/guardian-academic-queries.functions";
import {listGuardianGradeFollowUps} from "@/modules/learning/guardian-grade-response.functions";
import {getScopedPrograms} from "@/modules/operations/program-preview.functions";
import {getAssignments,saveAssignmentDraft,saveAssignmentResponse} from "@/modules/student-experience/assignments.functions";
import {createSubmissionAttachmentUpload,attachDocumentToSubmission} from "@/modules/learning/submission-attachments.functions";
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","isolated-pglite-only");
  const dialect=new PgDialect();
  // Use production column types/defaults; relationship gates are tested separately.
  for(const table of [s.organizations,s.sites,s.people,s.programs,s.guardianRelationships,s.studentProfiles,s.sections,s.sectionTeachers,s.terms,s.courseTemplateVersions,s.enrollments,s.assessments,s.submissions,s.documents,s.actions]){
    const config=getTableConfig(table);
    const columns=config.columns.map(column=>{
      let type=column.getSQLType();
      if(column.enumValues?.length)type="text";
      let defaultSql="";
      if(column.default instanceof SQL)defaultSql=" DEFAULT "+dialect.sqlToQuery(column.default).sql;
      else if(column.default!==undefined){
        const value=typeof column.default==="object"?JSON.stringify(column.default):String(column.default);
        defaultSql=" DEFAULT '"+value.replaceAll("'","''")+"'";
      }
      return `"${column.name}" ${type}${column.notNull?" NOT NULL":""}${column.primary?" PRIMARY KEY":""}${defaultSql}`;
    });
    await state.client.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await state.client.exec('CREATE UNIQUE INDEX submission_attempt_uq ON submissions(assessment_id,student_profile_id,attempt_number)');
  await db.insert(s.studentProfiles).values({id:id(5),personId:id(2)});
  await db.insert(s.organizations).values({id:id(12),type:"church",name:"School church",slug:"school-church"});
  await db.insert(s.sites).values({id:id(3),organizationId:id(12),name:"School campus",slug:"school-campus"});
  await db.insert(s.programs).values({id:id(4),organizationId:id(12),siteId:id(3),jurisdictionId:id(13),type:"full_school",name:"School",slug:"school",gradeRange:{min:"9",max:"12"},academicProviderOrganizationId:id(12)});
  await db.insert(s.people).values({id:id(2),legalFirstName:"Jordan",legalLastName:"Learner"});
  await db.insert(s.guardianRelationships).values({guardianPersonId:id(11),studentPersonId:id(2),relationshipLabel:"parent",canViewAcademics:true,metadata:{verification:"verified"}});
  await db.insert(s.terms).values({id:id(7),schoolYearId:id(8),key:"fall",name:"Fall",sequence:1,startsOn:"2026-10-01",endsOn:"2026-12-31"});
  await db.insert(s.courseTemplateVersions).values({id:id(9),courseTemplateId:id(10),version:1,status:"published",curriculum:{learning:{
    version:1,syllabus:"Algebra",resources:[],modules:[{id:"unit",title:"Equations",lessons:[{
      id:"lesson-1",title:"Solving equations",body:"Work through the examples and upload your completed worksheet.",resources:[],
    }]}],
  }}});
  await db.insert(s.sections).values({id:id(6),programId:id(4),siteId:id(3),termId:id(7),courseTemplateVersionId:id(9),title:"Algebra",code:"ALG",active:true});
  await db.insert(s.sectionTeachers).values({sectionId:id(6),personId:id(1),role:"teacher"});
  await db.insert(s.enrollments).values([
    {studentProfileId:id(5),organizationId:id(12),programId:id(4),schoolYearId:id(8),kind:"program",status:"active"},
    {studentProfileId:id(5),organizationId:id(12),programId:id(4),schoolYearId:id(8),sectionId:id(6),kind:"section",status:"active"},
  ]);
});
afterAll(async()=>{await state.client.close();vi.unstubAllEnvs();});
it("publishes lesson-linked work, submits a worksheet, preserves it for review and releases the grade",async()=>{
  expect(await getScopedPrograms()).toEqual([expect.objectContaining({id:id(4),name:"School",siteName:"School campus",counts:expect.objectContaining({sections:1,enrollments:1,teachers:1})})]);
  const assessment=await createAssessment({data:{sectionId:id(6),title:"Worksheet draft",instructions:"Directions in progress.",
    pointsPossible:10,curriculumLessonId:"lesson-1",dueAt:new Date(Date.now()+86400000).toISOString(),publishNow:false}});
  state.role="student";
  expect((await getAssignments()).assignments).toEqual([]);
  state.role="teacher";
  expect((await getGradebook({data:{sectionId:id(6)}})).assessments[0]).toMatchObject({status:"draft",instructions:"Directions in progress."});
  await manageAssessment({data:{assessmentId:assessment.assessmentId,action:"edit_draft",title:"Equation worksheet",instructions:"Upload the completed worksheet."}});
  await manageAssessment({data:{assessmentId:assessment.assessmentId,action:"publish"}});
  state.role="student";
  const assigned=(await getAssignments()).assignments[0];
  expect(assigned).toMatchObject({assessmentId:assessment.assessmentId,title:"Equation worksheet",instructions:"Upload the completed worksheet.",status:"assigned",canEdit:true,metadata:{curriculumLessonId:"lesson-1"}});
  await saveAssignmentDraft({data:{assessmentId:assessment.assessmentId,text:""}});
  const upload=await createSubmissionAttachmentUpload({data:{assessmentId:assessment.assessmentId,fileName:"worksheet.pdf",contentType:"application/pdf",sizeBytes:100}});
  await attachDocumentToSubmission({data:{assessmentId:assessment.assessmentId,documentId:upload.documentId}});
  const receipt=await saveAssignmentResponse({data:{assessmentId:assessment.assessmentId,text:""}});
  expect((await getAssignments()).assignments[0]).toMatchObject({status:"submitted",submissionId:receipt.submissionId,canEdit:false});
  state.role="teacher";
  expect((await getGradebook({data:{sectionId:id(6)}})).cells).toEqual(expect.arrayContaining([
    expect.objectContaining({submissionId:receipt.submissionId,status:"submitted"}),
  ]));
  expect(await getSubmissionReview({data:{submissionId:receipt.submissionId}})).toMatchObject({responseText:"",attachments:[{id:upload.documentId,fileName:"worksheet.pdf"}]});
  await gradeSubmission({data:{submissionId:receipt.submissionId,score:8,feedbackComment:"Private scoring draft",draftOnly:true}});
  state.role="guardian";
  expect((await getGuardianAssignments({data:{studentPersonId:id(2)}})).assignments[0]).toMatchObject({score:null,feedback:"",status:"submitted"});
  state.role="teacher";
  await gradeSubmission({data:{submissionId:receipt.submissionId,score:8,feedbackComment:"Good reasoning. Check the final subtraction."}});
  state.role="student";
  expect((await getAssignments()).assignments[0]).toMatchObject({status:"graded",score:"8.00",feedbackText:"Good reasoning. Check the final subtraction."});
  state.role="guardian";
  expect((await getGuardianAssignments({data:{studentPersonId:id(2)}})).assignments[0]).toMatchObject({status:"graded",score:"8.00",feedback:"Good reasoning. Check the final subtraction."});
  await db.insert(s.actions).values({id:id(14),type:"guardian_grade_follow_up",title:"Question about worksheet",subjectType:"student_profile",subjectId:id(5),sectionId:id(6),programId:id(4),siteId:id(3),status:"resolved",resolvedAt:new Date(),resolutionNote:"We reviewed the final subtraction together.",metadata:{submissionId:receipt.submissionId,requestedByGuardianPersonId:id(11),requestMessage:"Can you explain the final subtraction?"}});
  expect((await listGuardianGradeFollowUps()).items).toEqual(expect.arrayContaining([
    expect.objectContaining({id:id(14),status:"resolved",submissionId:receipt.submissionId,resolutionNote:"We reviewed the final subtraction together."}),
  ]));
  const [evidence]=await db.select().from(s.submissions).where(eq(s.submissions.id,receipt.submissionId));
  expect(evidence.response).toMatchObject({text:"",attachments:[upload.documentId]});
},15000);
