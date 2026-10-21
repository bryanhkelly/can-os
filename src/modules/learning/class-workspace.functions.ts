import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { classResources, readClassContent } from "@/domain/class-content";
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
    const content = section.contentStatus === "published" ? readClassContent(section.curriculum) : null;
    const teachers = await db.select({ personId: s.people.id, firstName: s.people.legalFirstName,
      lastName: s.people.legalLastName, preferredName: s.people.preferredName }).from(s.sectionTeachers)
      .innerJoin(s.people, eq(s.people.id, s.sectionTeachers.personId))
      .where(eq(s.sectionTeachers.sectionId, section.id));
    const progress = studentProfileId ? await db.select({ lessonId: s.lessonProgress.lessonId, completedAt: s.lessonProgress.completedAt })
      .from(s.lessonProgress).where(and(eq(s.lessonProgress.sectionId, section.id),
        eq(s.lessonProgress.courseTemplateVersionId, section.versionId), eq(s.lessonProgress.studentProfileId, studentProfileId))) : [];
    const roster = actor.role === "teacher" ? await db.select({ profileId: s.studentProfiles.id, personId: s.people.id,
      firstName: s.people.legalFirstName, lastName: s.people.legalLastName, preferredName: s.people.preferredName })
      .from(s.enrollments).innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(and(eq(s.enrollments.sectionId, section.id), eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active")))
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
      url:s.curriculumOverlays.url,resourceId:s.curriculumOverlays.resourceId,siteId:s.curriculumOverlays.siteId,
      sectionId:s.curriculumOverlays.sectionId,lessonId:s.curriculumOverlays.lessonId,
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
      lessonId:item.lessonId}));
    // Pack-level resources are only visible when the program has an active adoption
    // AND the owning organization has an active entitlement. Bindings are read-only.
    const publisherRows=await db.select({
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
           isNull(s.curriculumResourceBindings.courseTemplateVersionId))));
    const allSupplements=[...publisherRows.map(row=>({...row})),...supplements];
    const lessonIds = new Set(content?.modules.flatMap(module => module.lessons.map(lesson => lesson.id)) ?? []);
    return {
      role: actor.role, section: { id: section.id, title: section.title, code: section.code, description: section.description,
        subject: section.subject, versionId: section.versionId, contentStatus: section.contentStatus },
      studentPersonId, content, supplements:allSupplements,
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
      const content = readClassContent(section.curriculum);
      if (!content?.modules.some(module => module.lessons.some(lesson => lesson.id === data.lessonId))) throw new Error("Lesson unavailable in this course version.");
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
    const content = readClassContent(section.curriculum);
    const resource = content && classResources(content).find(item => item.id === data.resourceId);
    if (!resource?.documentId) throw new AuthorizationError("configured private class resource");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
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
