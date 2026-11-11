import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { enrollments, guardianRelationships, instructionalTrackActivities, instructionalTracks, instructionalTrackVersions,
  people, programs, studentInstructionalSelections, studentPracticeProgress } from "@/db/schema";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { assertCurrentPracticeSelection, parseStudentPracticeBody } from "@/domain/instructional-tracks";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { personDisplayName } from "@/domain/person-name";
import { EventTypes } from "@/domain/event-types";
import type { Actor } from "@/modules/identity/actors.server";
import { requireCurrentProgramSiteAuthorization } from "@/modules/programs/program-site-authorization.server";
import { authorizeClass } from "./class-access.server";
import { requireCurriculumDeliveryAccess } from "./curriculum-delivery-access.server";
import { requireActiveTrackActor, requireTrackFeature, type TrackTx } from "./instructional-track-access.server";
import { assertTrackDeliverable, readTrackBundle, trackPrivateKeyPattern, type TrackBundle } from "./instructional-track-content.server";
import { trackCommand } from "./instructional-track-command.server";
import { signPrivateObjectUrl } from "@/platform/storage/r2";

const uuid = z.string().uuid();
export const studentTrackReadSchema = z.object({ sectionId: uuid, studentPersonId: uuid.optional() }).strict();
export const studentTrackSelectSchema = studentTrackReadSchema.extend({ sectionEnrollmentId: uuid,
  trackVersionId: uuid, expectedRevision: z.number().int().min(0), requestId: uuid }).strict();
export const practiceProgressSchema = z.object({ sectionId: uuid, sectionEnrollmentId: uuid, trackActivityId: uuid,
  expectedRevision: z.number().int().min(1), action: z.enum(["start", "attempt", "complete"]), requestId: uuid }).strict();
export const lessonTrackReadSchema = studentTrackReadSchema.extend({ publisherLessonId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/) }).strict();

async function studentContext(tx: TrackTx, actor: Actor, input: z.infer<typeof studentTrackReadSchema>, enrollmentId?: string, historical = false) {
  if (!["student", "guardian"].includes(actor.role) || (actor.role === "student" && input.studentPersonId && input.studentPersonId !== actor.actorPersonId))
    throw new AuthorizationError("student or related guardian instructional context");
  assertCapability(actor, actor.role === "guardian" ? "student:related-read" : "student:read");
  await requireActiveTrackActor(tx, actor);
  const auth = await authorizeClass(actor, input.sectionId, input.studentPersonId, tx);
  if (actor.role === "guardian") {
    const [related] = await tx.select({ id: guardianRelationships.id }).from(guardianRelationships).where(guardianRelationshipPredicate({
      guardianPersonId: actor.actorPersonId, studentPersonId: auth.studentPersonId!, access: "academic",
    })).for("share").limit(1);
    if (!related) throw new AuthorizationError("current verified guardian academic relationship");
  }
  // Serialize selection and practice mutations on the SAME canonical enrollment.
  const rows = await tx.select().from(enrollments).where(and(eq(enrollments.sectionId, auth.section.id),
    eq(enrollments.studentProfileId, auth.studentProfileId!), eq(enrollments.programId, auth.section.programId),
    eq(enrollments.schoolYearId, auth.section.schoolYearId), eq(enrollments.kind, "section"), eq(enrollments.status, "active")))
    .for("update").limit(2);
  const enrollment = rows[0];
  if (rows.length !== 1 || !enrollment || (enrollmentId && enrollment.id !== enrollmentId))
    throw new AuthorizationError("exact active Section enrollment");
  const memberships = await tx.select({ id: enrollments.id }).from(enrollments).where(and(
    eq(enrollments.studentProfileId, enrollment.studentProfileId), eq(enrollments.programId, auth.section.programId),
    eq(enrollments.schoolYearId, auth.section.schoolYearId), eq(enrollments.kind, "program"), eq(enrollments.status, "active")))
    .for("share").limit(2);
  if (memberships.length !== 1) throw new AuthorizationError("exact active Program and school-year membership");
  // Recheck after acquiring the enrollment lock, including guardian and Program/year membership.
  await authorizeClass(actor, input.sectionId, input.studentPersonId, tx);
  const [program] = await tx.select().from(programs).where(eq(programs.id, auth.section.programId)).for("share").limit(1);
  if (!program) throw new AuthorizationError("active instructional Program");
  if (!historical) await requireCurriculumDeliveryAccess(tx, auth.section);
  if (!historical && (program.hostOrganizationId ?? program.organizationId) !== program.academicProviderOrganizationId)
    await requireCurrentProgramSiteAuthorization(tx, program.id, ["curriculum", "academic_instruction"]);
  return { ...auth, enrollment, program };
}
const scopeFor = (context: Awaited<ReturnType<typeof studentContext>>) => ({ programId: context.program.id,
  organizationId: context.program.academicProviderOrganizationId, siteId: context.section.siteId, sectionId: context.section.id });
async function activeSelection(tx: TrackTx, enrollmentId: string) {
  const [selection] = await tx.select().from(studentInstructionalSelections).where(and(
    eq(studentInstructionalSelections.sectionEnrollmentId, enrollmentId), isNull(studentInstructionalSelections.supersededAt))).limit(1);
  return selection ?? null;
}
const deliveryContext = (context: Awaited<ReturnType<typeof studentContext>>, selectedAt: Date | null) => ({
  providerOrganizationId: context.program.academicProviderOrganizationId, courseVersionId: context.section.versionId, selectionCreatedAt: selectedAt, programId: context.program.id,
});

export async function listStudentInstructionalTracks(actor: Actor, raw: z.infer<typeof studentTrackReadSchema>) {
  const input = studentTrackReadSchema.parse(raw);
  return db.transaction(async tx => {
    const context = await studentContext(tx, actor, input);
    requireTrackFeature(context.program, "choice"); requireTrackFeature(context.program, "delivery");
    const current = await activeSelection(tx, context.enrollment.id);
    const candidates = await tx.select({ versionId: instructionalTrackVersions.id, title: instructionalTracks.title,
      presenterId: people.id, firstName: people.legalFirstName, lastName: people.legalLastName, preferredName: people.preferredName })
      .from(instructionalTrackVersions).innerJoin(instructionalTracks, eq(instructionalTracks.id, instructionalTrackVersions.trackId))
      .innerJoin(people, eq(people.id, instructionalTracks.presenterPersonId))
      .where(and(eq(instructionalTrackVersions.courseTemplateVersionId, context.section.versionId), eq(instructionalTrackVersions.status, "published"),
        eq(instructionalTracks.producerOrganizationId, context.program.academicProviderOrganizationId), eq(people.active, true)))
      .orderBy(asc(instructionalTracks.title), desc(instructionalTrackVersions.version));
    const tracks = [];
    for (const candidate of candidates) {
      const bundle = await readTrackBundle(tx, candidate.versionId);
      try { await assertTrackDeliverable(tx, bundle, deliveryContext(context, null)); }
      catch (error) { if (error instanceof AuthorizationError) continue; throw error; }
      tracks.push({ versionId: candidate.versionId, title: candidate.title, presenterId: candidate.presenterId,
        presenterName: personDisplayName({ legalFirstName: candidate.firstName, legalLastName: candidate.lastName, preferredName: candidate.preferredName }),
        lessonCount: bundle.lessons.filter(l => l.placement === "primary").length, practiceCount: bundle.activities.length });
    }
    return { sectionEnrollmentId: context.enrollment.id, current: current ? { id: current.id, revision: current.revision, versionId: current.trackVersionId } : null, tracks };
  });
}

export async function selectStudentInstructionalTrack(actor: Actor, raw: z.infer<typeof studentTrackSelectSchema>) {
  const input = studentTrackSelectSchema.parse(raw);
  return db.transaction(async tx => {
    const context = await studentContext(tx, actor, input, input.sectionEnrollmentId);
    const policy = requireTrackFeature(context.program, "choice"); requireTrackFeature(context.program, "delivery");
    if (policy.selectionPolicy === "guardian" && actor.role !== "guardian") throw new AuthorizationError("guardian selection required by Program policy");
    if (actor.role === "guardian") {
      const [relationship] = await tx.select({ id: guardianRelationships.id }).from(guardianRelationships)
        .where(guardianRelationshipPredicate({ guardianPersonId: actor.actorPersonId, studentPersonId: context.studentPersonId!, access: "enrollment" }))
        .for("share").limit(1);
      if (!relationship) throw new AuthorizationError("guardian enrollment authority for recorded instructor selection");
    }
    return trackCommand(tx, actor, { ...input, action: "student.instructional.track.select", eventType: EventTypes.StudentInstructionalTrackSelected,
      entityType: "enrollment", entityId: context.enrollment.id, scope: scopeFor(context), payload: input }, async () => {
      const current = await activeSelection(tx, context.enrollment.id);
      const [latest] = await tx.select({ revision: studentInstructionalSelections.revision }).from(studentInstructionalSelections)
        .where(eq(studentInstructionalSelections.sectionEnrollmentId, context.enrollment.id)).orderBy(desc(studentInstructionalSelections.revision)).limit(1);
      if ((current?.revision ?? latest?.revision ?? 0) !== input.expectedRevision) throw new Error("Recorded teacher selection changed. Reload before selecting.");
      if (current && current.trackVersionId === input.trackVersionId) return { selectionId: current.id, revision: current.revision, trackVersionId: current.trackVersionId };
      if (current && !policy.allowSwitching) throw new AuthorizationError("recorded teacher switching allowed by Program policy");
      const bundle = await readTrackBundle(tx, input.trackVersionId);
      await assertTrackDeliverable(tx, bundle, deliveryContext(context, null));
      const now = new Date();
      if (current) await tx.update(studentInstructionalSelections).set({ supersededAt: now }).where(eq(studentInstructionalSelections.id, current.id));
      const [created] = await tx.insert(studentInstructionalSelections).values({ sectionEnrollmentId: context.enrollment.id,
        trackVersionId: bundle.version.id, selectedByPersonId: actor.actorPersonId, selectionSource: actor.role === "guardian" ? "guardian" : "student",
        revision: (latest?.revision ?? 0) + 1, requestId: input.requestId, selectedAt: now }).returning();
      return { selectionId: created!.id, revision: created!.revision, trackVersionId: created!.trackVersionId };
    });
  });
}

function learnerResource(bundle: TrackBundle, resourceId: string) {
  const resource = bundle.resources.find(r => r.id === resourceId);
  if (!resource || resource.id === bundle.version.rightsEvidenceResourceId || resource.metadata.audience !== "student")
    throw new AuthorizationError("student-facing approved track resource");
  const doc = bundle.docs.find(d => d.id === resource.documentId);
  const url = resource.url ?? (doc ? signPrivateObjectUrl({ method: "GET", key: doc.storageKey, keyPattern: trackPrivateKeyPattern, expiresSeconds: 300 }) : null);
  if (!url) throw new AuthorizationError("available track asset");
  return { id: resource.id, title: resource.title, kind: resource.kind, url };
}

export async function getSelectedLessonInstruction(actor: Actor, raw: z.infer<typeof lessonTrackReadSchema>) {
  const input = lessonTrackReadSchema.parse(raw);
  return db.transaction(async tx => {
    const context = await studentContext(tx, actor, input);
    requireTrackFeature(context.program, "delivery");
    const selection = await activeSelection(tx, context.enrollment.id);
    if (!selection) return { selection: null, recordings: [], practice: [] };
    const bundle = await readTrackBundle(tx, selection.trackVersionId);
    await assertTrackDeliverable(tx, bundle, deliveryContext(context, selection.selectedAt));
    const recordings = bundle.lessons.filter(l => l.publisherLessonId === input.publisherLessonId).map(l => ({
      id: l.id, placement: l.placement, sequence: l.sequence, media: learnerResource(bundle, l.resourceId),
      captions: l.captionResourceId ? learnerResource(bundle, l.captionResourceId) : null,
      transcript: l.transcriptResourceId ? learnerResource(bundle, l.transcriptResourceId) : null,
    }));
    if (!recordings.some(r => r.placement === "primary")) throw new AuthorizationError("canonical lesson in selected instructional track");
    const progress = await tx.select().from(studentPracticeProgress).where(eq(studentPracticeProgress.sectionEnrollmentId, context.enrollment.id));
    const practiceEnabled = process.env.CAN_INSTRUCTIONAL_TRACK_PRACTICE_ENABLED === "true" &&
      context.program.metadata.instructionalTracks && (context.program.metadata.instructionalTracks as Record<string, unknown>).practiceEnabled === true;
    const practice = practiceEnabled ? bundle.activities.filter(a => a.publisherLessonId === input.publisherLessonId).map(a => ({
      id: a.id, title: a.title, kind: a.kind, recommendationLevel: a.recommendationLevel, sequence: a.sequence,
      estimatedMinutes: a.estimatedMinutes, body: a.body ? parseStudentPracticeBody(a.body) : null,
      resource: a.resourceId ? learnerResource(bundle, a.resourceId) : null,
      progress: progress.filter(p => p.trackActivityId === a.id).map(p => ({ status: p.status, attemptCount: p.attemptCount,
        completedAt: p.completedAt?.toISOString() ?? null }))[0] ?? null,
    })) : [];
    return { selection: { id: selection.id, revision: selection.revision, trackVersionId: selection.trackVersionId, title: bundle.track.title }, recordings, practice };
  });
}

export async function recordStudentPracticeProgress(actor: Actor, raw: z.infer<typeof practiceProgressSchema>) {
  const input = practiceProgressSchema.parse(raw);
  if (actor.role !== "student") throw new AuthorizationError("student's own formative practice");
  return db.transaction(async tx => {
    const context = await studentContext(tx, actor, { sectionId: input.sectionId }, input.sectionEnrollmentId);
    requireTrackFeature(context.program, "practice"); requireTrackFeature(context.program, "delivery");
    return trackCommand(tx, actor, { ...input, action: "student.practice.progress", eventType: EventTypes.StudentPracticeProgressChanged,
      entityType: "enrollment", entityId: context.enrollment.id, scope: scopeFor(context), payload: input }, async () => {
      const selection = await activeSelection(tx, context.enrollment.id);
      if (!selection) throw new AuthorizationError("active recorded teacher selection");
      const bundle = await readTrackBundle(tx, selection.trackVersionId);
      await assertTrackDeliverable(tx, bundle, deliveryContext(context, selection.selectedAt));
      const activity = bundle.activities.find(a => a.id === input.trackActivityId);
      if (!activity) throw new AuthorizationError("activity on the selected track");
      assertCurrentPracticeSelection({ expectedRevision: input.expectedRevision, currentRevision: selection.revision,
        currentTrackVersionId: selection.trackVersionId, activityTrackVersionId: activity.trackVersionId,
        sectionCourseVersionId: context.section.versionId, trackCourseVersionId: bundle.version.courseTemplateVersionId });
      const now = new Date();
      const [existing] = await tx.select().from(studentPracticeProgress).where(and(eq(studentPracticeProgress.sectionEnrollmentId, context.enrollment.id),
        eq(studentPracticeProgress.trackActivityId, activity.id))).for("update").limit(1);
      const complete = existing?.status === "completed" || input.action === "complete";
      const values = { status: complete ? "completed" as const : "in_progress" as const,
        attemptCount: (existing?.attemptCount ?? 0) + (input.action === "attempt" ? 1 : 0),
        completedAt: existing?.completedAt ?? (complete ? now : null), lastInteractionAt: now, updatedAt: now };
      if (existing) await tx.update(studentPracticeProgress).set(values).where(eq(studentPracticeProgress.id, existing.id));
      else await tx.insert(studentPracticeProgress).values({ ...values, sectionEnrollmentId: context.enrollment.id, trackActivityId: activity.id });
      return { activityId: activity.id, status: values.status, attemptCount: values.attemptCount, completedAt: values.completedAt?.toISOString() ?? null };
    });
  });
}

export async function readStudentPracticeHistory(actor: Actor, raw: z.infer<typeof studentTrackReadSchema>) {
  const input = studentTrackReadSchema.parse(raw);
  return db.transaction(async tx => {
    const context = await studentContext(tx, actor, input, undefined, true); requireTrackFeature(context.program, "practice");
    const rows = await tx.select({ activityId: instructionalTrackActivities.id, trackVersionId: instructionalTrackActivities.trackVersionId,
      publisherLessonId: instructionalTrackActivities.publisherLessonId, status: studentPracticeProgress.status,
      attemptCount: studentPracticeProgress.attemptCount, completedAt: studentPracticeProgress.completedAt,
      lastInteractionAt: studentPracticeProgress.lastInteractionAt }).from(studentPracticeProgress)
      .innerJoin(instructionalTrackActivities, eq(instructionalTrackActivities.id, studentPracticeProgress.trackActivityId))
      .where(eq(studentPracticeProgress.sectionEnrollmentId, context.enrollment.id)).orderBy(desc(studentPracticeProgress.lastInteractionAt));
    // Historical evidence contains no original exercise, media, answer, score or withdrawn asset URL.
    return { sectionEnrollmentId: context.enrollment.id, history: rows.map(r => ({ ...r,
      completedAt: r.completedAt?.toISOString() ?? null, lastInteractionAt: r.lastInteractionAt.toISOString() })) };
  });
}
