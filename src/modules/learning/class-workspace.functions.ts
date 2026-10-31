import { readCurriculumDeliveryAccess, requireCurriculumDeliveryAccess } from "./curriculum-delivery-access.server";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { buildClassAssessmentEvidence, summarizeClassAssessmentEvidence } from "@/domain/class-assessment-evidence";
import { z } from "zod";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { classResources, readClassContent } from "@/domain/class-content";
import { readClassTeacherGuides } from "@/domain/class-teacher-guides";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { recordAudit } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { signPrivateObjectUrl } from "@/platform/storage/r2";
import { accessibleClasses, authorizeClass, classActor } from "./class-access.server";

export const classSelection = z.object({ sectionId: z.string().uuid(), studentPersonId: z.string().uuid().optional() });

export const getClassDirectory = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await classActor();
  return { role: actor.role, classes: await accessibleClasses(actor) };
});

export const getClassWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => classSelection.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await classActor();
    const { section, studentProfileId, studentPersonId } = await authorizeClass(actor, data.sectionId, data.studentPersonId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    // The publisher's accepted course version defines the full learning sequence.
    // A new week is ordinary publisher content, not a per-class adoption.
    const curriculumAccess=await readCurriculumDeliveryAccess(db,section);
    const content=curriculumAccess.available?readClassContent(section.curriculum):null;
    // School and teacher additions are separate supplements and assignments.
    const teacherGuides=actor.role==="teacher"&&curriculumAccess.available
      ?readClassTeacherGuides(section.curriculum):null;
    if(teacherGuides && (teacherGuides.courseCode!==section.courseCode ||
       teacherGuides.units.some(unit=>!content?.modules.some(module=>module.id===unit.unitId &&
         unit.lessons.every(lesson=>module.lessons.some(item=>item.id===lesson.lessonId))))))
      throw new Error("Teacher guide does not match the published class release.");
    const teachers = await db.select({ personId: s.people.id, firstName: s.people.legalFirstName,
      lastName: s.people.legalLastName, preferredName: s.people.preferredName }).from(s.sectionTeachers)
      .innerJoin(s.people, eq(s.people.id, s.sectionTeachers.personId))
      .where(eq(s.sectionTeachers.sectionId, section.id));
    const progress = studentProfileId ? await db.select({ lessonId: s.lessonProgress.lessonId, completedAt: s.lessonProgress.completedAt })
      .from(s.lessonProgress).where(and(eq(s.lessonProgress.sectionId, section.id),
        eq(s.lessonProgress.courseTemplateVersionId, section.versionId), eq(s.lessonProgress.studentProfileId, studentProfileId))) : [];
    // Actual class assessments, not a generated progress estimate. A student or
    // related guardian only sees their own latest attempts; teachers see counts
    // and use the authorized gradebook for individual learners' grades.
    const assessmentRows = await db.select({
      id:s.assessments.id,title:s.assessments.title,
      status:s.assessments.status,pointsPossible:s.assessments.pointsPossible,
      metadata:s.assessments.metadata,
    }).from(s.assessments).where(and(
      eq(s.assessments.sectionId,section.id),
      inArray(s.assessments.status,["published","closed"]),
    )).orderBy(s.assessments.createdAt);
    const assessmentIds=assessmentRows.map(row=>row.id);
    const attemptRows=studentProfileId && assessmentIds.length
      ?await db.select({
        assessmentId:s.submissions.assessmentId,
        attemptNumber:s.submissions.attemptNumber,
        status:s.submissions.status,score:s.submissions.score,
      }).from(s.submissions).where(and(
        inArray(s.submissions.assessmentId,assessmentIds),
        eq(s.submissions.studentProfileId,studentProfileId),
      )).orderBy(desc(s.submissions.attemptNumber))
      :[];
    const assessmentEvidence=buildClassAssessmentEvidence(assessmentRows,attemptRows);
    const activeProgramMembership=alias(s.enrollments,"workspace_active_program_enrollment");
    const roster = actor.role === "teacher" ? await db.select({ profileId: s.studentProfiles.id, personId: s.people.id,
      firstName: s.people.legalFirstName, lastName: s.people.legalLastName, preferredName: s.people.preferredName })
      .from(s.enrollments).innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .innerJoin(activeProgramMembership,and(
        eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
        eq(activeProgramMembership.programId,section.programId),
        eq(activeProgramMembership.schoolYearId,section.schoolYearId),
        eq(activeProgramMembership.kind,"program"),eq(activeProgramMembership.status,"active"),
      ))
      .where(and(eq(s.enrollments.sectionId, section.id), eq(s.enrollments.kind, "section"),
        eq(s.enrollments.status, "active"),eq(s.enrollments.programId,section.programId),
        eq(s.enrollments.schoolYearId,section.schoolYearId)))
      .orderBy(s.people.legalLastName) : [];
    const rosterProgress = roster.length ? await db.select({ profileId: s.lessonProgress.studentProfileId, lessonId: s.lessonProgress.lessonId })
      .from(s.lessonProgress).where(and(eq(s.lessonProgress.sectionId, section.id),
        eq(s.lessonProgress.courseTemplateVersionId, section.versionId), inArray(s.lessonProgress.studentProfileId, roster.map(row => row.profileId)),
        sql`${s.lessonProgress.completedAt} is not null`)) : [];
    const threads = await db.select({ id: s.communicationThreads.id, title: s.communicationThreads.subject,
      metadata: s.communicationThreads.metadata, createdAt: s.communicationThreads.createdAt })
      .from(s.communicationThreads).where(and(eq(s.communicationThreads.contextType, "section"),
        eq(s.communicationThreads.contextId, section.id))).orderBy(s.communicationThreads.createdAt);
    const announcements = threads.filter(row => row.metadata.kind === "class_announcement");
    const announcementMessages = announcements.length ? await db.select({
      threadId: s.communicationMessages.threadId, body: s.communicationMessages.body,
    }).from(s.communicationMessages).where(inArray(s.communicationMessages.threadId, announcements.map(row => row.id)))
      .orderBy(s.communicationMessages.sentAt) : [];
    // Supplements are separately owned records, never edits to a published publisher release.
    // The authorized section determines program, site and version; browser input cannot widen the scope.
    const overlayRows = await db.select({
      id:s.curriculumOverlays.id,title:s.curriculumOverlays.title,kind:s.curriculumOverlays.kind,
      createdByPersonId:s.curriculumOverlays.createdByPersonId,
      url:s.curriculumOverlays.url,resourceId:s.curriculumOverlays.resourceId,siteId:s.curriculumOverlays.siteId,
      sectionId:s.curriculumOverlays.sectionId,lessonId:s.curriculumOverlays.lessonId,
      metadata:s.curriculumOverlays.metadata,
    }).from(s.curriculumOverlays).where(and(
      eq(s.curriculumOverlays.programId,section.programId),
      eq(s.curriculumOverlays.courseTemplateVersionId,section.versionId),
      eq(s.curriculumOverlays.status,"active")));
    const attachedResourceIds=overlayRows.map(item=>item.resourceId).filter((id):id is string=>!!id);
    const attached=attachedResourceIds.length?await db.select({
      id:s.curriculumResources.id,url:s.curriculumResources.url,
    }).from(s.curriculumResources).where(inArray(s.curriculumResources.id,attachedResourceIds)):[];
    const supplements=overlayRows.filter(item=>
      item.sectionId ? item.sectionId===section.id :
      item.siteId ? item.siteId===section.siteId : true,
    ).map(item=>({id:item.id,title:item.title,kind:item.kind,
      url:item.resourceId?attached.find(resource=>resource.id===item.resourceId)?.url??null:item.url,
      lessonId:item.lessonId,
      source:item.metadata?.source==="teacher_supplement"?"teacher" as const:"organization" as const,
      canManage:actor.role==="teacher"&&item.metadata?.source==="teacher_supplement"&&
        item.createdByPersonId===actor.actorPersonId}));
    // Pack-level resources are only visible when the program has an active adoption
    // AND the owning organization has an active entitlement. Bindings are read-only.
    const publisherRows=curriculumAccess.available?await db.select({
      id:s.curriculumResources.id,title:s.curriculumResources.title,
      kind:s.curriculumResources.kind,url:s.curriculumResources.url,
      lessonId:s.curriculumResourceBindings.lessonId,
    }).from(s.curriculumAdoptions)
      .innerJoin(s.curriculumEntitlements,and(
        eq(s.curriculumEntitlements.packId,s.curriculumAdoptions.packId),
        eq(s.curriculumEntitlements.organizationId,s.curriculumAdoptions.organizationId),
        eq(s.curriculumEntitlements.status,"active")))
      .innerJoin(s.curriculumResourceBindings,
        eq(s.curriculumResourceBindings.packVersionId,s.curriculumAdoptions.packVersionId))
      .innerJoin(s.curriculumResources,
        eq(s.curriculumResources.id,s.curriculumResourceBindings.resourceId))
      .where(and(eq(s.curriculumAdoptions.programId,section.programId),
        eq(s.curriculumAdoptions.status,"active"),
        or(eq(s.curriculumResourceBindings.courseTemplateVersionId,section.versionId),
           isNull(s.curriculumResourceBindings.courseTemplateVersionId)))):[];
    const allSupplements=[...publisherRows.map(row=>({...row,source:"publisher" as const,canManage:false})),...supplements];
    const lessonIds = new Set(content?.modules.flatMap(module => module.lessons.filter(isLearnerFacingInstruction).map(lesson => lesson.id)) ?? []);
    // Only the assigned teacher receives aggregate, student-reported completion counts.
    // No student identities, grades or mastery in this planning view.
    const completionGroups=new Map<string,Set<string>>();
    if(actor.role==="teacher")for(const row of rosterProgress){
      if(!lessonIds.has(row.lessonId))continue;
      const students=completionGroups.get(row.lessonId)??new Set<string>();
      students.add(row.profileId);
      completionGroups.set(row.lessonId,students);
    }
    const lessonCompletionCounts=actor.role==="teacher"
      ?[...completionGroups].map(([lessonId,students])=>({lessonId,studentCount:students.size})):[];
    return {
      lessonCompletionCounts,
      role: actor.role, section: { id: section.id, title: section.title, code: section.code, description: section.description,
        subject: section.subject, versionId: section.versionId, contentStatus: section.contentStatus },
      studentPersonId, content, teacherGuides, curriculumAccess, supplements:allSupplements,
      assessmentEvidence, assessmentEvidenceSummary:summarizeClassAssessmentEvidence(assessmentEvidence),
      teachers: teachers.map(row => ({ personId: row.personId, name: `${row.preferredName ?? row.firstName} ${row.lastName}` })),
      progress: progress.filter(row => lessonIds.has(row.lessonId)).map(row => ({ lessonId: row.lessonId, completedAt: row.completedAt?.toISOString() ?? null })),
      roster: [...new Map(roster.map(row => [row.profileId, {
        profileId: row.profileId, personId: row.personId, name: `${row.preferredName ?? row.firstName} ${row.lastName}`,
        completedLessons: rosterProgress.filter(progress => progress.profileId === row.profileId && lessonIds.has(progress.lessonId)).length,
      }])).values()],
      announcements: announcements.map(row => ({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString(),
        body: announcementMessages.filter(message => message.threadId === row.id).map(message => message.body).join("\n\n") })),
    };
  });

export const setLessonCompletion = createServerFn({ method: "POST" })
  .validator((value: unknown) => classSelection.extend({
    versionId: z.string().uuid(), lessonId: z.string().min(1).max(100), completed: z.boolean(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await classActor();
    if (actor.role !== "student") throw new AuthorizationError("student lesson progress");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { section, studentProfileId } = await authorizeClass(actor, data.sectionId, undefined, tx);
      if (!studentProfileId || section.contentStatus !== "published" || section.versionId !== data.versionId) {
        throw new Error("This published course version is no longer available. Reload your class.");
      }
      if (data.completed) await requireCurriculumDeliveryAccess(tx,section);
      const content=readClassContent(section.curriculum);
      const lesson=content?.modules.flatMap(module=>module.lessons).find(lesson=>lesson.id===data.lessonId);
      if (!lesson || (data.completed && !isLearnerFacingInstruction(lesson)))
        throw new Error("Instructional lesson unavailable in this published section release.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"lesson:"+section.id+":"+studentProfileId+":"+data.lessonId}))`);
      const [existing] = await tx.select().from(s.lessonProgress).where(and(
        eq(s.lessonProgress.sectionId, section.id), eq(s.lessonProgress.studentProfileId, studentProfileId),
        eq(s.lessonProgress.courseTemplateVersionId, section.versionId), eq(s.lessonProgress.lessonId, data.lessonId),
      )).limit(1);
      if (Boolean(existing?.completedAt) === data.completed) return { saved: true };
      const completedAt = data.completed ? new Date() : null;
      const [saved] = await tx.insert(s.lessonProgress).values({
        sectionId: section.id, courseTemplateVersionId: section.versionId, studentProfileId,
        lessonId: data.lessonId, completedAt,
      }).onConflictDoUpdate({
        target: [s.lessonProgress.studentProfileId, s.lessonProgress.sectionId, s.lessonProgress.courseTemplateVersionId, s.lessonProgress.lessonId],
        set: { completedAt, updatedAt: new Date() },
      }).returning({ id: s.lessonProgress.id });
      if (!saved) throw new Error("Unable to save lesson progress.");
      await recordAudit(tx, actor, { action: "learning.lesson_completion", resourceType: "lesson_progress", resourceId: saved.id,
        before: { completed: Boolean(existing?.completedAt) }, after: { completed: data.completed, lessonId: data.lessonId, versionId: section.versionId },
        scope: { sectionId: section.id, programId: section.programId, siteId: section.siteId } });
      await emitEvent(tx, { eventType: EventTypes.LessonCompletionChanged, aggregateType: "lesson_progress", aggregateId: saved.id,
        actorPersonId: actor.actorPersonId, payload: { sectionId: section.id, studentProfileId, lessonId: data.lessonId, completed: data.completed } });
      return { saved: true };
    });
  });

export const getClassResourceDownload = createServerFn({ method: "POST" })
  .validator((value: unknown) => classSelection.extend({ resourceId: z.string().min(1).max(100) }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await classActor();
    const { section } = await authorizeClass(actor, data.sectionId, data.studentPersonId);
    if (section.contentStatus !== "published") throw new AuthorizationError("published class resource");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    await requireCurriculumDeliveryAccess(db,section);
    const content = readClassContent(section.curriculum);
    const resource = content && classResources(content).find(item => item.id === data.resourceId);
    if (!resource?.documentId) throw new AuthorizationError("configured private class resource");
    const [document] = await db.select({ key: s.documents.storageKey }).from(s.documents).where(and(
      eq(s.documents.id, resource.documentId),
      verifiedPrivateDocumentPredicate({
        subjectType: "course_template_version", subjectId: section.versionId,
        category: "class_resource", sensitivityTier: "standard",
      }),
    )).limit(1);
    if (!document || !document.key.startsWith(`learning/resources/${section.versionId}/`)) throw new AuthorizationError("verified class resource");
    return { downloadUrl: signPrivateObjectUrl({ method: "GET", key: document.key,
      keyPattern: /^learning\/resources\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i, expiresSeconds: 60 }) };
  });


/** Never expose an R2 key to callers. A private supplement requires a current class
 * relationship, a matching program/site/course, and a verified resource document. */
export const getClassSupplementDownload = createServerFn({method:"POST"})
  .validator((value:unknown)=>classSelection.extend({supplementId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await classActor();
    const {section}=await authorizeClass(actor,data.sectionId,data.studentPersonId);
    if(section.contentStatus!=="published")throw new AuthorizationError("published class");
    const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    const [entry]=await db.select({
      overlay:s.curriculumOverlays,
      resourceId:s.curriculumResources.id,
      ownerOrganizationId:s.curriculumResources.ownerOrganizationId,
      documentId:s.curriculumResources.documentId,
      docKey:s.documents.storageKey,
      docType:s.documents.mimeType,
      docVerified:s.documents.verifiedAt,
      docCategory:s.documents.category,
      docSubject:s.documents.subjectType,
      docSubjectId:s.documents.subjectId,
      docSensitivity:s.documents.sensitivityTier,
      docProvider:s.documents.storageProvider,
      docExpires:s.documents.expiresAt,
    }).from(s.curriculumOverlays)
      .innerJoin(s.curriculumResources,eq(s.curriculumResources.id,s.curriculumOverlays.resourceId))
      .innerJoin(s.documents,eq(s.documents.id,s.curriculumResources.documentId))
      .innerJoin(s.programs,eq(s.programs.id,s.curriculumOverlays.programId))
      .where(and(
        eq(s.curriculumOverlays.id,data.supplementId),
        eq(s.curriculumOverlays.programId,section.programId),
        eq(s.curriculumOverlays.courseTemplateVersionId,section.versionId),
        eq(s.curriculumOverlays.status,"active"),
        eq(s.curriculumResources.kind,"pdf"),
        eq(s.curriculumResources.ownerOrganizationId,s.programs.organizationId),
        verifiedPrivateDocumentPredicate({
          subjectType:"curriculum_resource",subjectId:s.curriculumResources.id,
          category:"curriculum_supplement",sensitivityTier:"standard",
        }),
      )).limit(1);
    if(!entry || (entry.overlay.sectionId && entry.overlay.sectionId!==section.id) ||
      (entry.overlay.siteId && entry.overlay.siteId!==section.siteId) ||
      !entry.docKey.startsWith(`learning/supplements/${entry.resourceId}/`) ||
      !/^learning\/supplements\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(entry.docKey) ||
      entry.docType!=="application/pdf")
      throw new AuthorizationError("verified private curriculum supplement");
    return {downloadUrl:signPrivateObjectUrl({
      method:"GET",key:entry.docKey,
      keyPattern:/^learning\/supplements\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i,
      expiresSeconds:60,
    })};
  });
