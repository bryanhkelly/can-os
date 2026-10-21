import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, courseTemplates, courseTemplateVersions, programs, sections } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertPublishableCurriculum, curriculumDraftContent, assertTeacherGuidesMatchCourse } from "@/domain/curriculum-authoring";
import { readClassContent, type ClassContent } from "@/domain/class-content";
import { readClassTeacherGuides, type ClassTeacherGuides } from "@/domain/class-teacher-guides";
import type { Actor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const curriculumPublisherCapability = "curriculum.publish";
const emptyContent: ClassContent = { version: 1, syllabus: "", modules: [], resources: [] };
const revision = (curriculum: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(curriculum, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest("hex");

async function authorize(actor: Actor, programId: string, tx: Pick<Transaction, "select">) {
  const [program] = await tx.select({ id: programs.id, organizationId: programs.organizationId, siteId: programs.siteId })
    .from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program || !await hasInstitutionalProgramCapability(actor, program, curriculumPublisherCapability, tx))
    throw new AuthorizationError("explicit curriculum publisher grant and program scope");
  return program;
}

async function ownedCourse(tx: Transaction, courseId: string, organizationId: string) {
  const [course] = await tx.select().from(courseTemplates).where(eq(courseTemplates.id, courseId)).for("update").limit(1);
  if (!course || course.owningOrganizationId !== organizationId)
    throw new AuthorizationError("curriculum owning organization");
  return course;
}

export async function readCurriculumPrograms(actor: Actor) {
  if (actor.role !== "registrar" || !actor.capabilities.has(curriculumPublisherCapability))
    throw new AuthorizationError("curriculum publisher session");
  const rows = await db.select({ id: programs.id, name: programs.name,
    organizationId: programs.organizationId, siteId: programs.siteId }).from(programs).where(and(
    inArray(programs.id, actor.scope.programIds ?? []), inArray(programs.siteId, actor.scope.siteIds ?? []),
    inArray(programs.organizationId, actor.scope.organizationIds ?? []))).orderBy(asc(programs.name));
  const permitted = await Promise.all(rows.map(async program => ({
    program, permitted: await hasInstitutionalProgramCapability(actor, program, curriculumPublisherCapability),
  })));
  return permitted.filter(row => row.permitted).map(row => ({ id: row.program.id, name: row.program.name }));
}

export async function readCurriculumStudio(actor: Actor, programId: string) {
  const program = await authorize(actor, programId, db);
  const courses = await db.select().from(courseTemplates)
    .where(eq(courseTemplates.owningOrganizationId, program.organizationId)).orderBy(asc(courseTemplates.title));
  const releases = await db.select({ id: courseTemplateVersions.id, courseId: courseTemplateVersions.courseTemplateId,
    version: courseTemplateVersions.version, status: courseTemplateVersions.status, curriculum: courseTemplateVersions.curriculum,
    publishedAt: courseTemplateVersions.publishedAt }).from(courseTemplateVersions)
    .innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(eq(courseTemplates.owningOrganizationId, program.organizationId)).orderBy(desc(courseTemplateVersions.version));
  return { programId, courses: courses.map(course => ({
    id: course.id, code: course.code, title: course.title, subject: course.subject,
    releases: releases.filter(release => release.courseId === course.id).map(release => ({
      id: release.id, version: release.version, status: release.status, revision: revision(release.curriculum),
      content: readClassContent(release.curriculum), teacherGuides: readClassTeacherGuides(release.curriculum),
      publishedAt: release.publishedAt?.toISOString() ?? null,
    })),
  })) };
}

export async function createCurriculumCourse(actor: Actor, input: {
  programId: string; code: string; title: string; subject: string; requestId: string;
}) {
  return db.transaction(async tx => {
    const program = await authorize(actor, input.programId, tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"curriculum:"+program.organizationId+":"+input.code}))`);
    const [existing] = await tx.select().from(courseTemplates).where(and(
      eq(courseTemplates.owningOrganizationId, program.organizationId), eq(courseTemplates.code, input.code))).limit(1);
    if (existing) {
      if (existing.metadata.authoringRequestId !== input.requestId || existing.title !== input.title || existing.subject !== input.subject)
        throw new Error("This course code already exists. Open the existing course or use a distinct code.");
      return { courseId: existing.id };
    }
    const [course] = await tx.insert(courseTemplates).values({ owningOrganizationId: program.organizationId,
      code: input.code, title: input.title, subject: input.subject, metadata: { authoringRequestId: input.requestId } })
      .returning({ id: courseTemplates.id });
    if (!course) throw new Error("Unable to create curriculum course.");
    await writeAudit(tx, actor, { action: "curriculum.course.create", entityType: "course_template", entityId: course.id,
      scope: { organizationId: program.organizationId, siteId: program.siteId, programId: program.id },
      after: { code: input.code, title: input.title, subject: input.subject } });
    await emitEvent(tx, { eventType: EventTypes.CurriculumCourseCreated, aggregateType: "course_template",
      aggregateId: course.id, actorPersonId: actor.actorPersonId, programId: program.id, organizationId: program.organizationId });
    return { courseId: course.id };
  });
}

export async function createCurriculumDraft(actor: Actor, input: {
  programId: string; courseId: string; sourceVersionId?: string; requestId: string;
}) {
  return db.transaction(async tx => {
    const program = await authorize(actor, input.programId, tx);
    await ownedCourse(tx, input.courseId, program.organizationId);
    const versions = await tx.select().from(courseTemplateVersions)
      .where(eq(courseTemplateVersions.courseTemplateId, input.courseId)).orderBy(desc(courseTemplateVersions.version));
    const retry = versions.find(version => version.curriculum.authoringRequestId === input.requestId);
    if (retry) {
      if ((retry.curriculum.sourceVersionId ?? null) !== (input.sourceVersionId ?? null))
        throw new Error("Draft request was already used with a different source version.");
      return { versionId: retry.id };
    }
    if (versions.some(version => version.status === "draft"))
      throw new Error("This course already has a draft. Continue editing it before creating another.");
    const source = input.sourceVersionId ? versions.find(version => version.id === input.sourceVersionId && version.status === "published") : undefined;
    if (input.sourceVersionId && !source) throw new Error("Choose a published source version from this course.");
    const curriculum = { ...(source?.curriculum ?? {}), learning: source ? readClassContent(source.curriculum) ?? emptyContent : emptyContent,
      authoringRequestId: input.requestId, sourceVersionId: input.sourceVersionId ?? null };
    const [created] = await tx.insert(courseTemplateVersions).values({ courseTemplateId: input.courseId,
      version: (versions[0]?.version ?? 0) + 1, status: "draft", curriculum }).returning({ id: courseTemplateVersions.id });
    if (!created) throw new Error("Unable to create curriculum draft.");
    await writeAudit(tx, actor, { action: "curriculum.draft.create", entityType: "course_template_version",
      entityId: created.id, scope: { programId: program.id, organizationId: program.organizationId },
      after: { courseId: input.courseId, sourceVersionId: input.sourceVersionId ?? null, version: (versions[0]?.version ?? 0) + 1 } });
    await emitEvent(tx, { eventType: EventTypes.CurriculumDraftCreated, aggregateType: "course_template_version", aggregateId: created.id,
      actorPersonId: actor.actorPersonId, programId: program.id, organizationId: program.organizationId });
    return { versionId: created.id };
  });
}

export async function saveCurriculumDraft(actor: Actor, input: {
  programId: string; versionId: string; expectedRevision: string; content: ClassContent;
  teacherGuides?: ClassTeacherGuides;
}) {
  const content = curriculumDraftContent.parse(input.content);
  return db.transaction(async tx => {
    const program = await authorize(actor, input.programId, tx);
    const [lookup] = await tx.select().from(courseTemplateVersions).where(eq(courseTemplateVersions.id, input.versionId)).limit(1);
    if (!lookup) throw new Error("Curriculum version not found.");
    const course = await ownedCourse(tx, lookup.courseTemplateId, program.organizationId);
    const [version] = await tx.select().from(courseTemplateVersions).where(eq(courseTemplateVersions.id, input.versionId)).for("update").limit(1);
    if (!version || version.status !== "draft") throw new Error("Published curriculum is immutable. Create a new draft.");
    const teacherGuides = input.teacherGuides
      ? assertTeacherGuidesMatchCourse(content, input.teacherGuides, course.code)
      : readClassTeacherGuides(version.curriculum);
    if (teacherGuides) assertTeacherGuidesMatchCourse(content, teacherGuides, course.code);
    const curriculum = { ...version.curriculum, learning: content,
      ...(teacherGuides ? {teacherGuides} : {}) };
    if (revision(curriculum) === revision(version.curriculum)) return { revision: revision(curriculum) };
    if (revision(version.curriculum) !== input.expectedRevision) throw new Error("This draft changed. Reload before saving; your edits have not been applied.");
    await tx.update(courseTemplateVersions).set({ curriculum, updatedAt: new Date() }).where(eq(courseTemplateVersions.id, version.id));
    await writeAudit(tx, actor, { action: "curriculum.draft.save", entityType: "course_template_version", entityId: version.id,
      scope: { programId: program.id, organizationId: program.organizationId },
      before: { curriculum: version.curriculum }, after: { curriculum } });
    await emitEvent(tx, { eventType: EventTypes.CurriculumDraftSaved, aggregateType: "course_template_version", aggregateId: version.id,
      actorPersonId: actor.actorPersonId, programId: program.id, payload: { revision: revision(curriculum) } });
    return { revision: revision(curriculum) };
  });
}

export async function publishCurriculumDraft(actor: Actor, input: {
  programId: string; versionId: string; expectedRevision: string; reason: string;
}) {
  return db.transaction(async tx => {
    const program = await authorize(actor, input.programId, tx);
    const [lookup] = await tx.select().from(courseTemplateVersions).where(eq(courseTemplateVersions.id, input.versionId)).limit(1);
    if (!lookup) throw new Error("Curriculum version not found.");
    const course = await ownedCourse(tx, lookup.courseTemplateId, program.organizationId);
    const [version] = await tx.select().from(courseTemplateVersions).where(eq(courseTemplateVersions.id, input.versionId)).for("update").limit(1);
    if (!version || revision(version.curriculum) !== input.expectedRevision)
      throw new Error("This draft changed. Reload and review before publishing.");
    if (version.status === "published") {
      const [audit] = await tx.select({ after: auditEvents.after }).from(auditEvents)
        .where(and(eq(auditEvents.resourceId, version.id), eq(auditEvents.action, "curriculum.publish"))).limit(1);
      if (audit?.after?.reason !== input.reason) throw new Error("This release was already published with different input.");
      return { versionId: version.id };
    }
    const content = readClassContent(version.curriculum);
    if (!content) throw new Error("Add curriculum content before publishing.");
    assertPublishableCurriculum(content);
    const teacherGuides=readClassTeacherGuides(version.curriculum);
    if(teacherGuides)assertTeacherGuidesMatchCourse(content,teacherGuides,course.code);
    const [existingSection] = await tx.select({ id: sections.id }).from(sections)
      .where(eq(sections.courseTemplateVersionId, version.id)).limit(1);
    if (existingSection) throw new Error("A section already references this draft. Reconcile its version before publishing; existing classes cannot be changed here.");
    await tx.update(courseTemplateVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(courseTemplateVersions.id, version.id));
    await writeAudit(tx, actor, { action: "curriculum.publish", entityType: "course_template_version", entityId: version.id,
      scope: { programId: program.id, organizationId: program.organizationId },
      before: { status: "draft" }, after: { status: "published", reason: input.reason, revision: input.expectedRevision, existingSectionsUnchanged: true } });
    await emitEvent(tx, { eventType: EventTypes.CurriculumPublished, aggregateType: "course_template_version", aggregateId: version.id,
      actorPersonId: actor.actorPersonId, programId: program.id, organizationId: program.organizationId,
      payload: { courseId: version.courseTemplateId, version: version.version, existingSectionsUnchanged: true } });
    return { versionId: version.id };
  });
}
