import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { instructionalTrackActivities, instructionalTrackActivitySecrets, instructionalTrackLessons, instructionalTrackReviews,
  instructionalTracks, instructionalTrackVersions, instructionalTrackWithdrawals, courseTemplates, courseTemplateVersions, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertTrackPublishable, parseStudentPracticeBody, trackReviewCriteria } from "@/domain/instructional-tracks";
import type { Actor } from "@/modules/identity/actors.server";
import { requireActiveTrackActor, requireTrackFeature, requireTrackProvider } from "./instructional-track-access.server";
import { trackCommand } from "./instructional-track-command.server";
import { assertTrackContentReady, readTrackBundle, sealTrackResources, trackSolutionSchema } from "./instructional-track-content.server";

const uuid = z.string().uuid();
const key = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const base = z.object({ programId: uuid, versionId: uuid });
const command = base.extend({ requestId: uuid });
export const createTrackDraftSchema = z.object({ programId: uuid, courseVersionId: uuid, trackId: uuid.optional(), requestId: uuid,
  title: z.string().trim().min(1).max(250), slug: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/) }).strict();
export const saveTrackDraftSchema = command.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  rightsEvidenceResourceId: uuid.nullable(), rightsExpiresAt: z.string().datetime().nullable(),
  lessons: z.array(z.object({ publisherLessonId: key, resourceId: uuid, captionResourceId: uuid.nullable(), transcriptResourceId: uuid.nullable(),
    placement: z.enum(["primary", "supplemental"]), sequence: z.number().int().min(0).max(1000) }).strict()).max(20000),
  activities: z.array(z.object({ publisherLessonId: key, activityKey: key, title: z.string().trim().min(1).max(250),
    kind: z.enum(["practice_problem_set", "interactive_exercise", "formative_quiz", "worked_example", "project_practice", "reflection"]),
    body: z.unknown().transform(value => value === null ? null : parseStudentPracticeBody(value)), resourceId: uuid.nullable(),
    recommendationLevel: z.enum(["suggested", "strongly_recommended"]), sequence: z.number().int().min(0).max(1000),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    privateSolutions: trackSolutionSchema.nullable(), feedbackRelease: z.enum(["never", "after_attempt", "after_completion"]),
  }).strict().refine(a => Boolean(a.body) || Boolean(a.resourceId), "Practice content is required")).max(4000),
}).strict();
export const trackReviewSchema = command.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  criterion: z.enum(trackReviewCriteria), decision: z.enum(["approved", "changes_requested", "rejected"]),
  rationale: z.string().trim().min(10).max(2000) }).strict();
export const trackReleaseSchema = command.extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const trackWithdrawalSchema = command.extend({ kind: z.enum(["routine_retirement", "urgent_rights", "urgent_safety"]),
  reason: z.string().trim().min(10).max(2000), legacyAccessUntil: z.string().datetime().nullable() }).strict();

export async function readInstructionalTrackCatalog(actor: Actor, raw: { programId: string }) {
  const input = z.object({ programId: uuid }).strict().parse(raw);
  return db.transaction(async tx => {
    const grant = await requireActiveTrackActor(tx, actor);
    const [program] = await tx.select().from(programs).where(eq(programs.id, input.programId)).for("share").limit(1);
    if (!program || !["academic_content_creator", "academic_content_reviewer"].includes(actor.role) || actor.sessionAccountId ||
      grant.siteId !== null || grant.organizationId !== program.academicProviderOrganizationId)
      throw new AuthorizationError("provider-owned content catalog");
    requireTrackFeature(program, "authoring");
    const candidates = await tx.select({ versionId: courseTemplateVersions.id, courseId: courseTemplates.id,
      title: courseTemplates.title, code: courseTemplates.code, version: courseTemplateVersions.version })
      .from(courseTemplateVersions).innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
      .where(and(eq(courseTemplates.owningOrganizationId, program.academicProviderOrganizationId), eq(courseTemplateVersions.status, "published")))
      .orderBy(asc(courseTemplates.title), desc(courseTemplateVersions.version));
    const courses = [];
    for (const candidate of candidates) {
      try { await requireTrackProvider(tx, actor, { programId: program.id, courseVersionId: candidate.versionId,
        capability: actor.role === "academic_content_creator" ? "instructional_track.author" : "instructional_track.review" }); }
      catch (error) { if (error instanceof AuthorizationError) continue; throw error; }
      courses.push(candidate);
    }
    const releases = courses.length ? await tx.select({ trackId: instructionalTracks.id, title: instructionalTracks.title,
      presenterPersonId: instructionalTracks.presenterPersonId, versionId: instructionalTrackVersions.id,
      version: instructionalTrackVersions.version, status: instructionalTrackVersions.status, courseVersionId: instructionalTrackVersions.courseTemplateVersionId })
      .from(instructionalTracks).innerJoin(instructionalTrackVersions, eq(instructionalTrackVersions.trackId, instructionalTracks.id))
      .where(and(eq(instructionalTracks.producerOrganizationId, program.academicProviderOrganizationId),
        inArray(instructionalTrackVersions.courseTemplateVersionId, courses.map(c => c.versionId)),
        actor.role === "academic_content_creator" ? eq(instructionalTracks.presenterPersonId, actor.actorPersonId) : undefined))
      .orderBy(asc(instructionalTracks.title), desc(instructionalTrackVersions.version)) : [];
    return { programId: program.id, courses, releases };
  });
}

export async function createInstructionalTrackDraft(actor: Actor, raw: z.infer<typeof createTrackDraftSchema>) {
  const input = createTrackDraftSchema.parse(raw);
  return db.transaction(async tx => {
    const program = await requireTrackProvider(tx, actor, { ...input, capability: "instructional_track.author" });
    const trackId = input.trackId ?? input.requestId;
    return trackCommand(tx, actor, { ...input, action: "instructional.track.draft.create", eventType: EventTypes.InstructionalTrackDraftCreated,
      entityType: "instructional_track", entityId: trackId, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      if (input.trackId) {
        const [existing] = await tx.select().from(instructionalTracks).where(eq(instructionalTracks.id, trackId)).for("update").limit(1);
        if (!existing || existing.presenterPersonId !== actor.actorPersonId || existing.producerOrganizationId !== program.academicProviderOrganizationId)
          throw new AuthorizationError("own provider track");
      } else {
        const { courseTemplateVersions } = await import("@/db/schema");
        const [course] = await tx.select().from(courseTemplateVersions).where(eq(courseTemplateVersions.id, input.courseVersionId)).limit(1);
        await tx.insert(instructionalTracks).values({ id: trackId, courseTemplateId: course!.courseTemplateId, presenterPersonId: actor.actorPersonId,
          producerOrganizationId: program.academicProviderOrganizationId, title: input.title, slug: input.slug });
      }
      const versions = await tx.select({ version: instructionalTrackVersions.version, status: instructionalTrackVersions.status })
        .from(instructionalTrackVersions).where(eq(instructionalTrackVersions.trackId, trackId)).orderBy(desc(instructionalTrackVersions.version));
      if (versions.some(v => v.status === "draft")) throw new Error("Continue the existing draft before creating another.");
      const [version] = await tx.insert(instructionalTrackVersions).values({ trackId, courseTemplateVersionId: input.courseVersionId,
        version: (versions[0]?.version ?? 0) + 1, createdByPersonId: actor.actorPersonId }).returning({ id: instructionalTrackVersions.id });
      const bundle = await readTrackBundle(tx, version!.id);
      return { trackId, versionId: version!.id, revision: bundle.computedManifestHash };
    });
  });
}

export async function readInstructionalTrackDraft(actor: Actor, raw: z.infer<typeof base>) {
  const input = base.strict().parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId);
    const capability = actor.role === "academic_content_creator" ? "instructional_track.author" : "instructional_track.review";
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability });
    if (bundle.track.producerOrganizationId !== program.academicProviderOrganizationId ||
      (capability === "instructional_track.author" && bundle.version.createdByPersonId !== actor.actorPersonId))
      throw new AuthorizationError("own provider content workspace");
    const reviews = await tx.select().from(instructionalTrackReviews).where(eq(instructionalTrackReviews.trackVersionId, bundle.version.id))
      .orderBy(asc(instructionalTrackReviews.decisionOrder));
    // Protected author/reviewer workspace only. Never reuse this DTO in learner APIs.
    return { track: bundle.track, version: bundle.version, lessons: bundle.lessons, activities: bundle.activities,
      privateSolutions: bundle.secrets, revision: bundle.computedManifestHash, reviews };
  });
}

export async function saveInstructionalTrackDraft(actor: Actor, raw: z.input<typeof saveTrackDraftSchema>) {
  const input = saveTrackDraftSchema.parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId, "update");
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability: "instructional_track.author" });
    if (bundle.version.createdByPersonId !== actor.actorPersonId || bundle.track.producerOrganizationId !== program.academicProviderOrganizationId)
      throw new AuthorizationError("own track draft");
    return trackCommand(tx, actor, { ...input, action: "instructional.track.draft.save", eventType: EventTypes.InstructionalTrackDraftSaved,
      entityType: "instructional_track_version", entityId: bundle.version.id, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      if (bundle.version.status !== "draft" || bundle.computedManifestHash !== input.expectedRevision)
        throw new Error("This draft changed or was submitted. Reload before saving.");
      if (bundle.activities.length) await tx.delete(instructionalTrackActivitySecrets)
        .where(inArray(instructionalTrackActivitySecrets.activityId, bundle.activities.map(a => a.id)));
      await tx.delete(instructionalTrackActivities).where(eq(instructionalTrackActivities.trackVersionId, bundle.version.id));
      await tx.delete(instructionalTrackLessons).where(eq(instructionalTrackLessons.trackVersionId, bundle.version.id));
      await tx.update(instructionalTrackVersions).set({ rightsEvidenceResourceId: input.rightsEvidenceResourceId,
        rightsExpiresAt: input.rightsExpiresAt ? new Date(input.rightsExpiresAt) : null, updatedAt: new Date() }).where(eq(instructionalTrackVersions.id, bundle.version.id));
      if (input.lessons.length) await tx.insert(instructionalTrackLessons).values(input.lessons.map(l => ({ ...l, trackVersionId: bundle.version.id })));
      for (const item of input.activities) {
        const { privateSolutions, feedbackRelease, ...activity } = item;
        const [created] = await tx.insert(instructionalTrackActivities).values({ ...activity, trackVersionId: bundle.version.id,
          createdByPersonId: actor.actorPersonId }).returning({ id: instructionalTrackActivities.id });
        if (privateSolutions) await tx.insert(instructionalTrackActivitySecrets).values({ activityId: created!.id,
          solutions: privateSolutions, feedbackRelease });
      }
      const next = await readTrackBundle(tx, bundle.version.id);
      // Invalid resource ownership/mapping can never become persisted draft content.
      await assertTrackContentReady(tx, next, new Date(), true);
      return { versionId: next.version.id, revision: next.computedManifestHash };
    });
  });
}

export async function submitInstructionalTrack(actor: Actor, raw: z.infer<typeof trackReleaseSchema>) {
  const input = trackReleaseSchema.parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId, "update");
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability: "instructional_track.author" });
    if (bundle.version.createdByPersonId !== actor.actorPersonId || bundle.track.producerOrganizationId !== program.academicProviderOrganizationId)
      throw new AuthorizationError("own provider track");
    return trackCommand(tx, actor, { ...input, action: "instructional.track.submit", eventType: EventTypes.InstructionalTrackSubmitted,
      entityType: "instructional_track_version", entityId: bundle.version.id, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      if (bundle.version.status !== "draft" || input.expectedRevision !== bundle.computedManifestHash) throw new Error("Reload the current draft before submission.");
      await assertTrackContentReady(tx, bundle);
      await sealTrackResources(tx, bundle);
      await tx.update(instructionalTrackVersions).set({ status: "in_review", manifestHash: bundle.computedManifestHash, updatedAt: new Date() })
        .where(eq(instructionalTrackVersions.id, bundle.version.id));
      return { versionId: bundle.version.id, revision: bundle.computedManifestHash, status: "in_review" };
    });
  });
}

export async function reviewInstructionalTrack(actor: Actor, raw: z.infer<typeof trackReviewSchema>) {
  const input = trackReviewSchema.parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId, "update");
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability: "instructional_track.review" });
    if (bundle.track.producerOrganizationId !== program.academicProviderOrganizationId || actor.actorPersonId === bundle.version.createdByPersonId || actor.actorPersonId === bundle.track.presenterPersonId)
      throw new AuthorizationError("independent provider content reviewer");
    return trackCommand(tx, actor, { ...input, action: "instructional.track.review", eventType: EventTypes.InstructionalTrackReviewed,
      entityType: "instructional_track_version", entityId: bundle.version.id, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      if (bundle.version.status !== "in_review" || bundle.version.manifestHash !== input.expectedRevision || bundle.computedManifestHash !== input.expectedRevision)
        throw new Error("Review the unchanged submitted manifest.");
      await assertTrackContentReady(tx, bundle);
      await tx.insert(instructionalTrackReviews).values({ trackVersionId: bundle.version.id, manifestHash: bundle.computedManifestHash,
        criterion: input.criterion, decision: input.decision, reviewerPersonId: actor.actorPersonId, rationale: input.rationale, requestId: input.requestId });
      return { versionId: bundle.version.id, criterion: input.criterion, decision: input.decision };
    });
  });
}

export async function publishInstructionalTrack(actor: Actor, raw: z.infer<typeof trackReleaseSchema>) {
  const input = trackReleaseSchema.parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId, "update");
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability: "instructional_track.publish" });
    if (bundle.track.producerOrganizationId !== program.academicProviderOrganizationId || actor.actorPersonId === bundle.version.createdByPersonId || actor.actorPersonId === bundle.track.presenterPersonId)
      throw new AuthorizationError("independent provider content publisher");
    return trackCommand(tx, actor, { ...input, action: "instructional.track.publish", eventType: EventTypes.InstructionalTrackPublished,
      entityType: "instructional_track_version", entityId: bundle.version.id, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      const lessonIds = await assertTrackContentReady(tx, bundle);
      if (bundle.version.status !== "in_review" || bundle.computedManifestHash !== input.expectedRevision)
        throw new Error("Publish the current independently reviewed submission.");
      const decisions = await tx.select().from(instructionalTrackReviews).where(and(eq(instructionalTrackReviews.trackVersionId, bundle.version.id),
        eq(instructionalTrackReviews.manifestHash, input.expectedRevision))).orderBy(desc(instructionalTrackReviews.decisionOrder));
      const latest = trackReviewCriteria.flatMap(criterion => decisions.find(d => d.criterion === criterion) ?? []);
      // Transition is independently guarded by DB review checks; any later validation failure rolls back.
      await tx.update(instructionalTrackVersions).set({ status: "approved", updatedAt: new Date() }).where(eq(instructionalTrackVersions.id, bundle.version.id));
      assertTrackPublishable({ status: "approved", sourceStatus: bundle.course.status, courseTemplateId: bundle.track.courseTemplateId,
        sourceCourseTemplateId: bundle.course.courseId, courseTemplateVersionId: bundle.version.courseTemplateVersionId, sourceVersionId: bundle.course.id,
        authorPersonId: bundle.version.createdByPersonId, presenterPersonId: bundle.track.presenterPersonId,
        manifestHash: bundle.version.manifestHash!, computedManifestHash: bundle.computedManifestHash, allLessonIds: lessonIds,
        requiredLessonIds: lessonIds, primaryLessonIds: bundle.lessons.filter(l => l.placement === "primary").map(l => l.publisherLessonId),
        practiceLessonIds: bundle.activities.map(a => a.publisherLessonId), rightsEvidencePresent: true, rightsExpiresAt: bundle.version.rightsExpiresAt,
        resourcesEligible: true, reviews: latest, now: new Date() });
      await tx.update(instructionalTrackVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(instructionalTrackVersions.id, bundle.version.id));
      return { versionId: bundle.version.id, status: "published", revision: bundle.computedManifestHash };
    });
  });
}

export async function withdrawInstructionalTrack(actor: Actor, raw: z.infer<typeof trackWithdrawalSchema>) {
  const input = trackWithdrawalSchema.parse(raw);
  return db.transaction(async tx => {
    const bundle = await readTrackBundle(tx, input.versionId, "update");
    const program = await requireTrackProvider(tx, actor, { programId: input.programId, courseVersionId: bundle.course.id, capability: "instructional_track.withdraw" });
    if (bundle.track.producerOrganizationId !== program.academicProviderOrganizationId) throw new AuthorizationError("own provider withdrawal");
    return trackCommand(tx, actor, { ...input, action: "instructional.track.withdraw", eventType: EventTypes.InstructionalTrackWithdrawn,
      entityType: "instructional_track_version", entityId: bundle.version.id, payload: input,
      scope: { programId: program.id, organizationId: program.academicProviderOrganizationId } }, async () => {
      if (!["published", "retired"].includes(bundle.version.status)) throw new Error("Only released tracks may be withdrawn.");
      const now = new Date(); const until = input.legacyAccessUntil ? new Date(input.legacyAccessUntil) : null;
      if (until && (input.kind !== "routine_retirement" || until <= now || !bundle.version.rightsExpiresAt || until > bundle.version.rightsExpiresAt))
        throw new Error("Legacy access must stay within current rights and is never allowed for urgent withdrawal.");
      await tx.insert(instructionalTrackWithdrawals).values({ trackVersionId: bundle.version.id, kind: input.kind, effectiveAt: now,
        legacyAccessUntil: until, reason: input.reason, createdByPersonId: actor.actorPersonId });
      if (bundle.version.status === "published") await tx.update(instructionalTrackVersions).set({ status: "retired", updatedAt: now })
        .where(eq(instructionalTrackVersions.id, bundle.version.id));
      return { versionId: bundle.version.id, status: "retired", kind: input.kind };
    });
  });
}
