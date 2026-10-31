import { assessmentAttemptLimit, assertAssessmentAttemptAllowed, MAX_ASSESSMENT_ATTEMPTS } from "@/domain/assessment-attempt-policy";
import { assertAssessmentActionable } from "@/domain/assessment-availability";
import { createAssessmentStatus } from "@/domain/assessment-publication";
import { assertAssessmentSchedule } from "@/domain/assessment-schedule";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { authorizeClass,accessibleClasses } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { EventTypes } from "@/domain/event-types";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readRubric,scoreRubric } from "@/modules/learning/rubric";
import { assertPublisherLessonReference,publisherLessonChoices } from "@/domain/publisher-course-references";
import { validateAssessmentRubric } from "@/domain/teacher-assessment-rubric";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,asc,desc,eq,inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { signPrivateObjectUrl } from "@/platform/storage/r2";

/** Read a stored criterion-level breakdown from submission feedback. */
function readRubricScores(value: unknown): Array<{ id: string; points: number }> {
 if (!Array.isArray(value)) return [];
 return value.filter((v): v is { id: string; points: number } =>
  !!v && typeof v === "object" && typeof v.id === "string" &&
  typeof v.points === "number" && Number.isFinite(v.points));
}

/** Only the authorized teacher gradebook projects private draft grading. */
function readGradingDraft(value: unknown) {
 if(!value || typeof value!=="object")return null;
 const draft=value as Record<string,unknown>;
 const feedback=draft.feedback && typeof draft.feedback==="object" ? draft.feedback as Record<string,unknown> : {};
 if(typeof draft.score!=="string" || !Number.isFinite(Number(draft.score)))return null;
 return {score:draft.score,comment:typeof feedback.comment==="string"?feedback.comment:"",
  rubricScores:readRubricScores((feedback.rubric as Record<string,unknown>|undefined)?.scores),
  savedAt:typeof draft.savedAt==="string"?draft.savedAt:null};
}

/** The gradebook uses the same exact-Section authority as the class workspace.
 * CAN academic teachers keep their original institution grant and NEVER receive
 * a host church-wide Site or Program grant through this path.
 */
async function teacherActor(sectionId?: string) {
 const context = await getCommandContext(getRequest());
 if (context.role !== "teacher" || !context.actorPersonId) throw new AuthorizationError("teacher gradebook access");
 if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length)
  throw new AuthorizationError("named teacher Section or Site scope");
 if (sectionId) await authorizeClass(context as Actor, sectionId);
 return context;
}

async function teacherForSubmission(submissionId: string) {
 const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const [row] = await db.select({ sectionId: schema.assessments.sectionId })
  .from(schema.submissions)
  .innerJoin(schema.assessments, eq(schema.assessments.id, schema.submissions.assessmentId))
  .where(eq(schema.submissions.id, submissionId))
  .limit(1);
 if (!row?.sectionId) throw new AuthorizationError("submission section");
 return teacherActor(row.sectionId);
}

async function submissionForReview(submissionId:string){
 const context=await teacherForSubmission(submissionId);
 assertCapability(context,"assignments:grade");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [submission]=await db.select({
  id:s.submissions.id,assessmentId:s.submissions.assessmentId,studentProfileId:s.submissions.studentProfileId,
  studentPersonId:s.studentProfiles.personId,response:s.submissions.response,attemptNumber:s.submissions.attemptNumber,
  submittedAt:s.submissions.submittedAt,status:s.submissions.status,
  score:s.submissions.score,feedback:s.submissions.feedback,
 }).from(s.submissions).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.submissions.studentProfileId))
  .where(eq(s.submissions.id,submissionId)).limit(1);
 if(!submission||!["submitted","graded","returned"].includes(submission.status))
  throw new AuthorizationError("submitted work for review");
 return {db,s,submission};
}

async function reviewAttachments(submissionId:string){
 const {db,s,submission}=await submissionForReview(submissionId);
 const ids=Array.isArray(submission.response.attachments)
  ?submission.response.attachments.filter((id):id is string=>typeof id==="string"&&z.string().uuid().safeParse(id).success):[];
 const documents=ids.length?await db.select({
  id:s.documents.id,fileName:s.documents.fileName,storageKey:s.documents.storageKey,verifiedAt:s.documents.verifiedAt,
 }).from(s.documents).where(and(inArray(s.documents.id,ids),
  verifiedPrivateDocumentPredicate({
   subjectType:"assessment",subjectId:submission.assessmentId,
   category:"assignment_submission",uploadedByPersonId:submission.studentPersonId,
  }))):[];
 return {db,s,submission,documents:documents.filter(document=>document.verifiedAt&&
  document.storageKey.startsWith(`learning/assignment/${submission.assessmentId}/`))};
}

export const getSubmissionReview=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({submissionId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {db,s,submission,documents}=await reviewAttachments(data.submissionId);
  const attempts=await db.select({id:s.submissions.id,attemptNumber:s.submissions.attemptNumber,
   status:s.submissions.status,submittedAt:s.submissions.submittedAt,score:s.submissions.score})
   .from(s.submissions).where(and(eq(s.submissions.assessmentId,submission.assessmentId),
    eq(s.submissions.studentProfileId,submission.studentProfileId))).orderBy(desc(s.submissions.attemptNumber));
  return {
   score:submission.score,
   feedbackComment:typeof submission.feedback?.comment==="string"?submission.feedback.comment:"",
   responseText:typeof submission.response.text==="string"?submission.response.text:"",
   attemptNumber:submission.attemptNumber,submittedAt:submission.submittedAt?.toISOString()??null,
   attachments:documents.map(document=>({id:document.id,fileName:document.fileName})),
   attempts:attempts.map(attempt=>({...attempt,submittedAt:attempt.submittedAt?.toISOString()??null})),
  };
 });

export const getTeacherSubmissionAttachment=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({submissionId:z.string().uuid(),documentId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {documents}=await reviewAttachments(data.submissionId);
  const document=documents.find(item=>item.id===data.documentId);
  if(!document)throw new AuthorizationError("verified attachment on authorized submission");
  return {downloadUrl:signPrivateObjectUrl({method:"GET",key:document.storageKey,
   keyPattern:/^learning\/assignment\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i,expiresSeconds:60})};
 });

/** Sections the authenticated teacher teaches, for the gradebook section picker. */
export const getGradebookSections = createServerFn({ method: "GET" }).handler(async () => {
 setResponseHeader("Cache-Control", "private, no-store");
 const context = await teacherActor();
 if (!process.env.DATABASE_URL) return { connected: false, sections: [] as { id: string; code: string; title: string }[] };
 // An institution's teacher appears only for the Sections authorized in
 // their live class directory. Never project the church's whole Site.
 const sections=(await accessibleClasses(context as Actor))
  .map(({id,title,code})=>({id,title,code}));
 return { connected: true, sections };
});

/** Students × assessments grid for one section the teacher teaches. */
export const getGradebook = createServerFn({ method: "GET" })
 .validator((value: unknown) => z.object({ sectionId: z.string().min(1) }).parse(value))
 .handler(async ({ data }) => {
  setResponseHeader("Cache-Control", "private, no-store");
  await teacherActor(data.sectionId);
  if (!process.env.DATABASE_URL) return { connected: false as const, section: null, students: [], assessments: [], cells: [], curriculumLessons: [] as Array<{id:string;title:string}> };
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [section] = await db.select({ id:s.sections.id,code:s.sections.code,
    title:s.sections.title,versionId:s.sections.courseTemplateVersionId,
    programId:s.sections.programId,schoolYearId:s.terms.schoolYearId,
    curriculum:s.courseTemplateVersions.curriculum,status:s.courseTemplateVersions.status })
   .from(s.sections)
   .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
   .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
   .where(eq(s.sections.id, data.sectionId))
   .limit(1);
  if (!section) throw new AuthorizationError("section");

  // A stale Section enrollment after a Program withdrawal must never leave
  // a child on the teacher's current roster or gradebook.
  const activeProgramMembership=alias(s.enrollments,"gradebook_active_program_enrollment");
  const studentRows = await db.select({
   studentProfileId: s.enrollments.studentProfileId,
   personId: s.people.id,
   firstName: s.people.legalFirstName,
   lastName: s.people.legalLastName,
   preferredName: s.people.preferredName,
  })
   .from(s.enrollments)
   .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
   .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
   .innerJoin(activeProgramMembership,and(
    eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
    eq(activeProgramMembership.programId,section.programId),
    eq(activeProgramMembership.schoolYearId,section.schoolYearId),
    eq(activeProgramMembership.kind,"program"),
    eq(activeProgramMembership.status,"active"),
   ))
   .where(and(
    eq(s.enrollments.sectionId, data.sectionId),
    eq(s.enrollments.programId,section.programId),
    eq(s.enrollments.schoolYearId,section.schoolYearId),
    eq(s.enrollments.kind, "section"),
    eq(s.enrollments.status, "active"),
   ))
   .orderBy(asc(s.people.legalLastName), asc(s.people.legalFirstName));

  const assessmentRows = await db.select({
   id: s.assessments.id,
   title: s.assessments.title,
   instructions: s.assessments.instructions,
   status: s.assessments.status,
   dueAt: s.assessments.dueAt,
   availableAt: s.assessments.availableAt,
   closesAt: s.assessments.closesAt,
   pointsPossible: s.assessments.pointsPossible,
   metadata: s.assessments.metadata,
  })
   .from(s.assessments)
   .where(and(eq(s.assessments.sectionId, data.sectionId), inArray(s.assessments.status, ["draft", "published", "closed"])))
   .orderBy(asc(s.assessments.dueAt));

  const assessmentIds = assessmentRows.map(row => row.id);
  const activeStudentIds = new Set(studentRows.map(row => row.studentProfileId));
  // Scope the database read itself to the live roster. Filtering only the
  // response would still load withdrawn pupils' private submissions.
  const submissionRows = assessmentIds.length && activeStudentIds.size
   ? await db.select({
    id: s.submissions.id,
    assessmentId: s.submissions.assessmentId,
    studentProfileId: s.submissions.studentProfileId,
    status: s.submissions.status,
    timeliness: s.submissions.timeliness,
    attemptNumber: s.submissions.attemptNumber,
    score: s.submissions.score,
    feedback: s.submissions.feedback,
    submittedAt: s.submissions.submittedAt,
    gradedAt: s.submissions.gradedAt,
   })
    .from(s.submissions)
    .where(and(inArray(s.submissions.assessmentId, assessmentIds),
     inArray(s.submissions.studentProfileId, [...activeStudentIds])))
    .orderBy(desc(s.submissions.attemptNumber))
   : [];

  // The gradebook grid must not return submissions for withdrawn pupils
  // even when their old Section enrollment and assessment history remain.
  // Apply the same live Program + Section membership as the student roster.
  const latest = new Map<string, (typeof submissionRows)[number]>();
  for (const row of submissionRows) {
   if (!activeStudentIds.has(row.studentProfileId)) continue;
   const key = `${row.studentProfileId}:${row.assessmentId}`;
   if (!latest.has(key)) latest.set(key, row);
  }

  return {
   connected: true as const,
   section:{id:section.id,code:section.code,title:section.title},
   curriculumLessons:publisherLessonChoices(section.curriculum,section.status),
   students: studentRows.map(row => ({
    studentProfileId: row.studentProfileId,
    personId: row.personId,
    displayName: `${row.preferredName ?? row.firstName} ${row.lastName}`,
   })),
   assessments: assessmentRows.map(row => ({
    id: row.id,
    title: row.title,
    instructions:row.instructions??"",
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    availableAt: row.availableAt?.toISOString() ?? null,
    closesAt: row.closesAt?.toISOString() ?? null,
    pointsPossible: row.pointsPossible,
    rubric: readRubric(row.metadata?.rubricCriteria),
    maxAttempts:assessmentAttemptLimit(row.metadata),
    kind:typeof row.metadata?.assignmentKind==="string"?row.metadata.assignmentKind:"classwork",
    curriculumLessonId:typeof row.metadata?.curriculumLessonId==="string"?row.metadata.curriculumLessonId:null,
   })),
   cells: [...latest.values()].map(row => ({
    submissionId: row.id,
    assessmentId: row.assessmentId,
    studentProfileId: row.studentProfileId,
    status: row.status,
    timeliness: row.timeliness,
    attemptNumber:row.attemptNumber,
    score: row.score,
    feedbackComment: typeof row.feedback?.comment === "string" ? row.feedback.comment : "",
    feedbackRubric: readRubricScores(
      (row.feedback?.rubric as Record<string, unknown> | undefined)?.scores,
    ),
    gradingDraft: row.status === "submitted" ? readGradingDraft(row.feedback?.gradingDraft) : null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    gradedAt: row.gradedAt?.toISOString() ?? null,
   })),
  };
 });

/** Grade a submitted attempt. Uses the GF1 grading service so audit and GradePosted events are written. */
export const gradeSubmission = createServerFn({ method: "POST" })
 .validator((value: unknown) => z.object({
  submissionId: z.string().min(1),
  score: z.number().finite().optional(),
  feedbackComment: z.string().max(4000).optional().default(""),
  draftOnly: z.boolean().optional().default(false),
  rubricScores: z.array(z.object({
   id: z.string().min(1).max(100),
   points: z.number().finite().min(0).max(1000),
  })).max(20).optional(),
 }).parse(value))
 .handler(async ({ data }) => {
  const context = await teacherForSubmission(data.submissionId);
  assertCapability(context, "assignments:grade");
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [record] = await db.select({ status: s.submissions.status, points: s.assessments.pointsPossible, metadata: s.assessments.metadata })
   .from(s.submissions)
   .innerJoin(s.assessments, eq(s.assessments.id, s.submissions.assessmentId))
   .where(eq(s.submissions.id, data.submissionId))
   .limit(1);
  if (!record) throw new Error("Submission not found");
  if (record.status !== "submitted") throw new Error("Only submitted work can be graded");
  const points = record.points === null ? null : Number(record.points);
  if (points === null || !Number.isFinite(points)) throw new Error("Assessment has no point value");

  // When criterion scores are supplied, the server derives the total from the
  // stored rubric; a client-sent total is never trusted.
  let finalScore = data.score;
  const feedback: Record<string, unknown> = { comment: data.feedbackComment.trim() };
  const criteria = readRubric(record.metadata?.rubricCriteria);
  if (criteria.length) {
   if (!data.rubricScores?.length) throw new Error("Score every rubric criterion before posting a grade");
   const result = scoreRubric(criteria, data.rubricScores);
   if (result.possible !== points) throw new Error(`Rubric total (${result.possible}) does not match the assessment point value (${points})`);
   finalScore = result.earned;
   feedback.rubric = {
    version: typeof record.metadata?.rubricVersion === "number" ? record.metadata.rubricVersion : 1,
    scores: data.rubricScores,
   };
  } else if (data.rubricScores?.length) {
   throw new Error("This assessment has no rubric");
  }
  if (finalScore === undefined) throw new Error("Enter a numeric score.");
  if (finalScore < 0 || finalScore > points) throw new Error(`Score must be from 0 to ${points}`);
  const missingWork = await import("./missing-work-service");
  // Teacher-of-section relationship and site scope are verified above; grant the
  // domain capability so the shared grading path runs its transaction with the
  // immutable audit event and GradePosted domain event.
  await missingWork.gradeSubmission(
   { ...context, capabilities: new Set([...context.capabilities, "submission.grade"]) },
   data.submissionId,
   { score: String(finalScore), feedback, draftOnly:data.draftOnly },
  );
  return { submissionId: data.submissionId };
 });

/** Assignment visibility is explicit, never inferred from a due date. */
export const createAssessment = createServerFn({ method: "POST" })
 .validator((value: unknown) => z.object({
  sectionId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  instructions: z.string().trim().max(20000).optional(),
  rubric: z.string().trim().max(10000).optional(),
  rubricCriteria: z.array(z.object({
   id: z.string(), label: z.string(), maxPoints: z.number(), description: z.string().optional(),
  }).strict()).max(20).optional(),
  pointsPossible: z.number().finite().min(1).max(1000),
  assignmentKind:z.enum(["homework","classwork","quiz","test","project","discussion"]).optional().default("classwork"),
  curriculumLessonId:z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
  dueAt: z.string().refine(v => !Number.isNaN(new Date(v).getTime()), "dueAt must be an ISO date").optional(),
  availableAt: z.string().datetime({offset:true}).optional(),
  closesAt: z.string().datetime({offset:true}).optional(),
  maxAttempts:z.number().int().min(1).max(MAX_ASSESSMENT_ATTEMPTS).optional(),
  publishNow:z.boolean().optional().default(false),
 }).strict().parse(value))
 .handler(async ({ data }) => {
  const context = await teacherActor(data.sectionId);
  assertCapability(context, "assignments:create");
  const rubricCriteria = validateAssessmentRubric(data.rubricCriteria ?? [], data.pointsPossible);
  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  const availableAt = data.availableAt ? new Date(data.availableAt) : data.publishNow ? new Date() : null;
  const closesAt = data.closesAt ? new Date(data.closesAt) : null;
  assertAssessmentSchedule({availableAt,dueAt,closesAt});
  const intendedStatus=createAssessmentStatus(data.publishNow,dueAt);
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return db.transaction(async tx => {
   // Recheck independent school agreement and teacher–Section relationship
   // inside the same transaction that creates the assessment.
   await authorizeClass(context as Actor,data.sectionId,undefined,tx);
   const [teachingSection]=await tx.select({
      id:s.sections.id,versionId:s.sections.courseTemplateVersionId,
      programId:s.sections.programId,schoolYearId:s.terms.schoolYearId,
      curriculum:s.courseTemplateVersions.curriculum,status:s.courseTemplateVersions.status,
     })
    .from(s.sectionTeachers)
    .innerJoin(s.sections,eq(s.sections.id,s.sectionTeachers.sectionId))
    .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
    .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
    .where(and(eq(s.sectionTeachers.personId,context.actorPersonId!),
     eq(s.sections.id,data.sectionId),eq(s.sections.active,true)))
    .limit(1);
   if(!teachingSection)throw new AuthorizationError("active teaching assignment in authorized school/program");
   assertPublisherLessonReference(teachingSection.curriculum,teachingSection.status,data.curriculumLessonId);
   const status=intendedStatus;
   const [assessment] = await tx.insert(s.assessments).values({
    sectionId: data.sectionId,
    title: data.title,
    instructions: data.instructions ?? null,
    metadata:{...(data.rubric?{rubric:data.rubric}:{}),
      ...(rubricCriteria.length?{rubricCriteria,rubricVersion:1}:{}),
      assignmentKind:data.assignmentKind,
      ...(data.maxAttempts!==undefined?{maxAttempts:data.maxAttempts}:{}),
      publisherCourseVersionId:teachingSection.versionId,
      ...(data.curriculumLessonId?{curriculumLessonTitle:publisherLessonChoices(
        teachingSection.curriculum,teachingSection.status).find(lesson=>lesson.id===data.curriculumLessonId)?.title}:{}),
      ...(data.curriculumLessonId?{curriculumLessonId:data.curriculumLessonId}:{})},
    status,
    pointsPossible: String(data.pointsPossible),
    dueAt,
    availableAt,
    closesAt,
    createdByPersonId: context.actorPersonId!,
   }).returning({ id: s.assessments.id });
   if (!assessment) throw new Error("Assessment could not be created");
   let assignedCount = 0;
   if (status === "published" && dueAt) {
    // Publishing assigns the assessment to actively enrolled students, matching publishAssessment.
    const activeProgramMembership=alias(s.enrollments,"new_assessment_program_enrollment");
    const enrolled = await tx.select({ studentProfileId: s.enrollments.studentProfileId })
     .from(s.enrollments)
     .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
      eq(activeProgramMembership.kind,"program"),eq(activeProgramMembership.status,"active"),
      eq(activeProgramMembership.programId,teachingSection.programId),
      eq(activeProgramMembership.schoolYearId,teachingSection.schoolYearId),
     ))
     .where(and(
      eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
      eq(s.enrollments.sectionId,data.sectionId),
      eq(s.enrollments.programId,teachingSection.programId),
      eq(s.enrollments.schoolYearId,teachingSection.schoolYearId),
     ));
    assignedCount = enrolled.length;
    if (enrolled.length) {
     await tx.insert(s.submissions).values(enrolled.map(row => ({
      assessmentId: assessment.id,
      studentProfileId: row.studentProfileId,
      status: "assigned" as const,
      timeliness: "on_time" as const,
     }))).onConflictDoNothing();
    }
    await emitEvent(tx, {
     eventType: EventTypes.AssessmentPublished,
     aggregateType: "assessment",
     aggregateId: assessment.id,
     actorPersonId: context.actorPersonId,
     payload: { sectionId: data.sectionId, dueAt: dueAt.toISOString(), assignedCount },
    });
   }
   await writeAudit(tx, {
    actorPersonId: context.actorPersonId,
    action: "assessment.create",
    resourceType: "assessment",
    resourceId: assessment.id,
    scope: { sectionId: data.sectionId },
    after: { status, title: data.title, pointsPossible: data.pointsPossible },
    context: { accountId: context.accountId, sessionId: context.sessionId, requestId: context.requestId ?? null },
   });
   return { assessmentId: assessment.id, status };
  });
 });


/** Canonical teacher assessment state transitions with roster assignment on publish. */
export const manageAssessment = createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
  assessmentId:z.string().uuid(),
  action:z.enum(["publish","close","reopen","reschedule","schedule","edit_draft"]),
  title:z.string().trim().min(3).max(200).optional(),
  instructions:z.string().trim().max(20000).optional(),
  dueAt:z.string().datetime({offset:true}).optional(),
  availableAt:z.string().datetime({offset:true}).nullable().optional(),
  closesAt:z.string().datetime({offset:true}).nullable().optional(),
 }).parse(input))
 .handler(async({data})=>{
  const context=await teacherActor();
  assertCapability(context,"assignments:create");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({
    id:s.assessments.id,sectionId:s.assessments.sectionId,
    status:s.assessments.status,dueAt:s.assessments.dueAt,title:s.assessments.title,instructions:s.assessments.instructions,
    availableAt:s.assessments.availableAt,closesAt:s.assessments.closesAt,siteId:s.sections.siteId,
    programId:s.sections.programId,schoolYearId:s.terms.schoolYearId
   }).from(s.assessments)
    .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
    .innerJoin(s.sectionTeachers,and(
     eq(s.sectionTeachers.sectionId,s.sections.id),
     eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(eq(s.assessments.id,data.assessmentId))
    .for("update").limit(1);
   if(!assessment)throw new AuthorizationError("assigned assessment in authorized program");
   await authorizeClass(context as Actor,assessment.sectionId,undefined,tx);
   const transitions:Record<typeof data.action,readonly string[]>={
    publish:["draft"],close:["published"],reopen:["closed"],
    reschedule:["published","closed"],
    schedule:["draft","published"],
    edit_draft:["draft"],
   };
   if(!transitions[data.action].includes(assessment.status))
    throw new Error("This assessment cannot be "+data.action+"d from its current status");
   const now=new Date();
   if(data.action==="edit_draft"&&!data.title)throw new Error("Enter a title before saving the draft");
   const dueAt=data.dueAt?new Date(data.dueAt):assessment.dueAt;
   if((data.action==="publish"||data.action==="reschedule")&&(!dueAt||dueAt<=now))
    throw new Error("A future due date is required");
   const status=data.action==="publish"||data.action==="reopen"?"published":
    data.action==="close"?"closed":assessment.status;
   const availableAt=data.action==="schedule" && data.availableAt!==undefined
    ?data.availableAt===null?null:new Date(data.availableAt)
    :data.action==="publish" ? assessment.availableAt??now :
    (data.action==="reopen"&&(!assessment.availableAt||assessment.availableAt>now))
     ?now:assessment.availableAt;
   const closesAt=data.action==="schedule" && data.closesAt!==undefined
    ?data.closesAt===null?null:new Date(data.closesAt)
    :data.action==="reopen"?null:assessment.closesAt;
   if(data.action==="schedule"||data.action==="reschedule")
    assertAssessmentSchedule({availableAt,dueAt,closesAt});
   const [updated]=await tx.update(s.assessments).set({
    status,
    ...(data.action==="publish"||data.action==="reschedule"||(data.action==="reopen"&&data.dueAt)?{dueAt}:{}),
    ...(data.action==="publish"?{availableAt}:{}),
    ...(data.action==="reopen"||data.action==="schedule"?{availableAt,closesAt}:{}),
    ...(data.action==="edit_draft"?{title:data.title!,instructions:data.instructions??assessment.instructions}:{}),
    updatedAt:now
   }).where(and(eq(s.assessments.id,assessment.id),eq(s.assessments.status,assessment.status)))
    .returning({id:s.assessments.id});
   if(!updated)throw new Error("Assessment status changed, refresh before retrying");
   let assignedCount=0;
   if(data.action==="publish"){
    const activeProgramMembership=alias(s.enrollments,"published_assessment_program_enrollment");
    const enrolled=await tx.select({studentProfileId:s.enrollments.studentProfileId})
     .from(s.enrollments)
     .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
      eq(activeProgramMembership.programId,assessment.programId),
      eq(activeProgramMembership.schoolYearId,assessment.schoolYearId),
      eq(activeProgramMembership.kind,"program"),eq(activeProgramMembership.status,"active"),
     ))
     .where(and(eq(s.enrollments.kind,"section"),
      eq(s.enrollments.sectionId,assessment.sectionId),
      eq(s.enrollments.programId,assessment.programId),
      eq(s.enrollments.schoolYearId,assessment.schoolYearId),
      eq(s.enrollments.status,"active")));
    assignedCount=enrolled.length;
    if(enrolled.length)await tx.insert(s.submissions)
     .values(enrolled.map(row=>({assessmentId:assessment.id,studentProfileId:row.studentProfileId,
      status:"assigned" as const,timeliness:"on_time" as const})))
     .onConflictDoNothing();
    await emitEvent(tx, {
     eventType:EventTypes.AssessmentPublished,aggregateType:"assessment",
     aggregateId:assessment.id,actorPersonId:context.actorPersonId,
     payload:{sectionId:assessment.sectionId,assignedCount,dueAt:dueAt!.toISOString()}
    });
   }
   if((data.action==="reschedule"||(data.action==="reopen"&&data.dueAt))&&
     dueAt?.getTime()!==assessment.dueAt?.getTime()){
    await emitEvent(tx, {
     eventType:EventTypes.AcademicCalendarChanged,aggregateType:"assessment",
     aggregateId:assessment.id,actorPersonId:context.actorPersonId,
     payload:{previousDueAt:assessment.dueAt?.toISOString()??null,
      newDueAt:dueAt?.toISOString()??null,action:data.action}
    });
   }
   await writeAudit(tx, {
    actorPersonId:context.actorPersonId,
    action:"assessment."+data.action,resourceType:"assessment",resourceId:assessment.id,
    scope:{siteId:assessment.siteId,programId:assessment.programId,sectionId:assessment.sectionId},
    before:{status:assessment.status,dueAt:assessment.dueAt?.toISOString()??null,
     ...(data.action==="edit_draft"?{title:assessment.title,instructions:assessment.instructions}:{}),
     availableAt:assessment.availableAt?.toISOString()??null,closesAt:assessment.closesAt?.toISOString()??null},
    after:{status,dueAt:dueAt?.toISOString()??null,assignedCount,
     ...(data.action==="edit_draft"?{title:data.title!,instructions:data.instructions??assessment.instructions}:{}),
     availableAt:availableAt?.toISOString()??null,closesAt:closesAt?.toISOString()??null},
    context:{accountId:context.accountId,sessionId:context.sessionId}
   });
   return {assessmentId:assessment.id,status,assignedCount};
  });
 });

/** Return a graded student submission for a new attempt without resetting its grade history. */
export const returnSubmissionForRevision=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({submissionId:z.string().uuid()}).parse(input))
 .handler(async({data})=>{
  const context=await teacherForSubmission(data.submissionId);
  assertCapability(context,"assignments:grade");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [record]=await tx.select({
    id:s.submissions.id,status:s.submissions.status,
    assessmentStatus:s.assessments.status,
    availableAt:s.assessments.availableAt,closesAt:s.assessments.closesAt,metadata:s.assessments.metadata,
    assessmentId:s.assessments.id,sectionId:s.sections.id,
    studentProfileId:s.submissions.studentProfileId,attemptNumber:s.submissions.attemptNumber,
    studentPersonId:s.studentProfiles.personId,
    siteId:s.sections.siteId,programId:s.sections.programId,
    schoolYearId:s.terms.schoolYearId,sectionActive:s.sections.active
   }).from(s.submissions)
    .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.submissions.studentProfileId))
    .innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
    .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
    .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),
     eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(eq(s.submissions.id,data.submissionId))
    .for("update").limit(1);
   if(!record)throw new AuthorizationError("graded submission in assigned section");
   await authorizeClass(context as Actor,record.sectionId,undefined,tx);
   if(record.status!=="graded")throw new Error("Only graded work can be returned for revision");
   // Returning work must grant the student a usable resubmission path.
   // A closed assessment or withdrawn Program would otherwise leave the
   // student notified to revise something they cannot submit.
   if(record.assessmentStatus!=="published" || !record.sectionActive)
    throw new Error("Reopen the published assessment and active class before returning work");
   assertAssessmentActionable({
    status:record.assessmentStatus,availableAt:record.availableAt,closesAt:record.closesAt,
   });
   assertAssessmentAttemptAllowed(record.metadata,record.attemptNumber+1);
   const activeProgramMembership=alias(s.enrollments,"revision_return_program_membership");
   const [member]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
    .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
      eq(activeProgramMembership.programId,record.programId),
      eq(activeProgramMembership.schoolYearId,record.schoolYearId),
      eq(activeProgramMembership.kind,"program"),
      eq(activeProgramMembership.status,"active"),
    ))
    .where(and(eq(s.enrollments.studentProfileId,record.studentProfileId),
      eq(s.enrollments.sectionId,record.sectionId),
      eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
      eq(s.enrollments.programId,record.programId),
      eq(s.enrollments.schoolYearId,record.schoolYearId)))
    .limit(1);
   if(!member)throw new Error("Student must have active Program and Section enrollment to revise work");
   const [latest]=await tx.select({id:s.submissions.id})
    .from(s.submissions).where(and(eq(s.submissions.assessmentId,record.assessmentId),
      eq(s.submissions.studentProfileId,record.studentProfileId)))
    .orderBy(desc(s.submissions.attemptNumber)).limit(1);
   if(!latest||latest.id!==record.id)throw new Error("Only the latest attempt may be returned");
   const [updated]=await tx.update(s.submissions)
    .set({status:"returned",returnedAt:new Date(),updatedAt:new Date()})
    .where(and(eq(s.submissions.id,record.id),eq(s.submissions.status,"graded")))
    .returning({id:s.submissions.id});
   if(!updated)throw new Error("Submission status changed before return");
   await writeAudit(tx, {
    actorPersonId:context.actorPersonId,action:"assignment.return",
    resourceType:"submission",resourceId:updated.id,
    scope:{siteId:record.siteId,programId:record.programId,sectionId:record.sectionId},
    before:{status:"graded"},after:{status:"returned"},
    context:{accountId:context.accountId,sessionId:context.sessionId}
   });
   await notify(tx, {
    recipientPersonId:record.studentPersonId,type:"assignment_feedback",
    status:"unread",title:"Assignment returned for revision",
    body:"Your teacher returned your work. Review feedback and submit a revision.",
    resourceType:"submission",resourceId:updated.id
   });
   return {submissionId:updated.id};
  });
 });
