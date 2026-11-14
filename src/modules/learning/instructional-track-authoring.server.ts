import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contentAssetVersions,
  contentManifestReviewDecisions,
  contentPublicationManifestItems,
  contentPublicationManifests,
  contentWithdrawals,
  courseLessons,
  courseVersions,
  courses,
  evidenceDocuments,
  evidenceDocumentVersions,
  instructionalTrackMaterials,
  instructionalTrackReviews,
  instructionalTrackVersions,
  instructionalTracks,
  publishedAssetReviews,
  trackLessonPresentations,
  type JsonObject,
  type JsonValue,
} from "@/db/canonical-v301";
import {
  AuthorizationError,
  assertCapability,
} from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import {
  buildTrackManifestUsages,
  isVerifiedEvidenceCurrent,
  parseStudentPracticeDefinition,
} from "@/domain/instructional-tracks";
import { runInstructionalTrackCommand } from "./instructional-track-command.server";
import { assertTrackProvider, type TrackProviderCapability } from "./instructional-track-access.server";

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const reviewKindSchema = z.enum([
  "academic",
  "rights",
  "accessibility",
  "coverage",
  "safeguarding",
]);
const decisionSchema = z.enum(["approved", "changes_requested", "rejected"]);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)
  .refine((value) => hasNoPrivatePracticeFields(value), "Private practice answers are not allowed.");

function hasNoPrivatePracticeFields(value: JsonValue): boolean {
  const privateKeys = new Set(["answer", "answerkey", "correctanswer", "solution", "solutions"]);
  if (Array.isArray(value)) return value.every(hasNoPrivatePracticeFields);
  if (value && typeof value === "object") {
    return Object.entries(value).every(([key, nested]) =>
      !privateKeys.has(key.toLowerCase().replace(/[_-]/g, "")) &&
      hasNoPrivatePracticeFields(nested),
    );
  }
  return true;
}

export const createInstructionalTrackDraftSchema = z.object({
  requestId: uuidSchema,
  courseVersionId: uuidSchema,
  trackId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(250),
  trackKind: z.enum(["primary", "supplemental"]).default("primary"),
}).strict();

export const saveInstructionalTrackDraftSchema = z.object({
  requestId: uuidSchema,
  trackVersionId: uuidSchema,
  expectedRevision: hashSchema,
  materials: z.array(z.object({
    courseUnitId: uuidSchema,
    assetVersionId: uuidSchema.nullable(),
    materialKind: z.enum(["instruction", "practice", "reference"]),
    activitySpec: jsonObjectSchema,
  }).strict()).max(2_000),
  presentations: z.array(z.object({
    courseLessonId: uuidSchema,
    assetVersionId: uuidSchema,
    presentationKind: z.enum(["primary", "worked_example", "supplement", "alternate_language"]),
    ordinal: z.number().int().min(1).max(10_000),
    accessibilityNotes: jsonObjectSchema.default({}),
  }).strict()).max(4_000),
}).strict();

export const instructionalTrackReleaseSchema = z.object({
  requestId: uuidSchema,
  trackVersionId: uuidSchema,
  expectedRevision: hashSchema,
}).strict();

export const reviewInstructionalTrackSchema = instructionalTrackReleaseSchema.extend({
  reviewKind: reviewKindSchema,
  decision: decisionSchema,
  rationale: z.string().trim().min(10).max(2_000),
  evidenceVersionId: uuidSchema.nullable().optional(),
}).strict();
export const withdrawInstructionalTrackSchema = z.object({
  requestId: uuidSchema,
  trackVersionId: uuidSchema,
  withdrawalKind: z.enum(["routine_retirement", "urgent_rights", "urgent_safety"]),
  reason: z.string().trim().min(10).max(2_000),
  legacyAccessUntil: z.string().datetime().nullable(),
}).strict();

function assertAuthenticated(context: AccessContext, capability: string): asserts context is AccessContext & {
  actorPersonId: string;
} {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, capability);
}

function assertPublisherScope(context: AccessContext, publisherOrganizationId: string): void {
  if (!context.scope.organizationIds?.includes(publisherOrganizationId)) {
    throw new AuthorizationError(`publisher organization scope: ${publisherOrganizationId}`);
  }
}

function invalid(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message);
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

export type TrackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type DraftBundle = {
  track: typeof instructionalTracks.$inferSelect;
  version: typeof instructionalTrackVersions.$inferSelect;
  course: typeof courses.$inferSelect;
  courseVersion: typeof courseVersions.$inferSelect;
};

async function loadDraftBundle(
  tx: TrackTransaction,
  trackVersionId: string,
  lock = false,
): Promise<DraftBundle> {
  const query = tx.select().from(instructionalTrackVersions)
    .where(eq(instructionalTrackVersions.id, trackVersionId));
  const [version] = lock ? await query.for("update").limit(1) : await query.limit(1);
  if (!version) throw new DomainError("UNAVAILABLE", "Instructional track version is unavailable.");
  const [track] = await tx.select().from(instructionalTracks)
    .where(eq(instructionalTracks.id, version.instructionalTrackId)).limit(1);
  const [course] = await tx.select().from(courses)
    .where(eq(courses.id, version.courseId)).limit(1);
  const [courseVersion] = await tx.select().from(courseVersions)
    .where(and(
      eq(courseVersions.id, version.courseVersionId),
      eq(courseVersions.courseId, version.courseId),
    ))
    .limit(1);
  if (!track || !course || !courseVersion) {
    throw new DomainError("UNAVAILABLE", "Instructional track ownership could not be verified.");
  }
  return { track, version, course, courseVersion };
}

async function assertDraftOwner(
  tx: TrackTransaction,
  context: AccessContext,
  bundle: DraftBundle,
  capability: TrackProviderCapability,
): Promise<void> {
  assertAuthenticated(context, capability);
  assertPublisherScope(context, bundle.course.publisherOrganizationId);
  if (bundle.track.producerOrganizationId !== bundle.course.publisherOrganizationId) {
    throw new AuthorizationError("publisher-owned instructional track");
  }
  await assertTrackProvider(tx, context, {
    organizationId: bundle.course.publisherOrganizationId,
    courseId: bundle.course.id,
    capability,
  });
}

async function currentDraftRevision(
  tx: TrackTransaction,
  bundle: DraftBundle,
): Promise<string> {
  const [materials, presentations] = await Promise.all([
    tx.select().from(instructionalTrackMaterials)
      .where(eq(instructionalTrackMaterials.trackVersionId, bundle.version.id)),
    tx.select().from(trackLessonPresentations)
      .where(eq(trackLessonPresentations.trackVersionId, bundle.version.id)),
  ]);
  const assetIds = [...new Set([
    ...materials.flatMap((item) => item.assetVersionId ? [item.assetVersionId] : []),
    ...presentations.map((item) => item.assetVersionId),
  ])];
  const assets = assetIds.length
    ? await tx.select({
        id: contentAssetVersions.id,
        sha256: contentAssetVersions.sha256,
        licenseTerms: contentAssetVersions.licenseTerms,
      }).from(contentAssetVersions)
      .where(inArray(contentAssetVersions.id, assetIds))
    : [];
  return runRevisionHash({
    track: {
      id: bundle.track.id,
      title: bundle.track.title,
      presenterPersonId: bundle.track.presenterPersonId,
      producerOrganizationId: bundle.track.producerOrganizationId,
    },
    version: {
      id: bundle.version.id,
      courseVersionId: bundle.version.courseVersionId,
      trackKind: bundle.version.trackKind,
      lifecycle: bundle.version.lifecycle,
      submissionManifestHash: bundle.version.submissionManifestHash,
    },
    materials: materials
      .map((item) => ({
        courseUnitId: item.courseUnitId,
        assetVersionId: item.assetVersionId,
        materialKind: item.materialKind,
        activitySpec: item.activitySpec,
      }))
      .sort((left, right) => `${left.courseUnitId}:${left.materialKind}`.localeCompare(
        `${right.courseUnitId}:${right.materialKind}`,
      )),
    presentations: presentations
      .map((item) => ({
        courseLessonId: item.courseLessonId,
        assetVersionId: item.assetVersionId,
        presentationKind: item.presentationKind,
        ordinal: item.ordinal,
        accessibilityNotes: item.accessibilityNotes,
      }))
      .sort((left, right) => `${left.courseLessonId}:${left.presentationKind}:${left.ordinal}`.localeCompare(
        `${right.courseLessonId}:${right.presentationKind}:${right.ordinal}`,
      )),
    assets: assets.sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function runRevisionHash(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
  return createHash("sha256").update(encoded ?? "").digest("hex");
}

export async function assertInstructionalTrackAssetsEligible(
  tx: TrackTransaction,
  assetVersionIds: string[],
): Promise<Map<string, {
  sha256: string;
  licenseTerms: JsonValue;
  rightsEvidenceVersionId: string;
}>> {
  const uniqueIds = [...new Set(assetVersionIds)];
  if (uniqueIds.length === 0) invalid("Add at least one approved instructional asset.");
  const versions = await tx.select({
    id: contentAssetVersions.id,
    sha256: contentAssetVersions.sha256,
    licenseTerms: contentAssetVersions.licenseTerms,
    lifecycle: contentAssetVersions.lifecycle,
  }).from(contentAssetVersions).where(inArray(contentAssetVersions.id, uniqueIds));
  if (versions.length !== uniqueIds.length) {
    invalid("Every track resource must reference a canonical content-asset version.");
  }
  const reviews = await tx.select({
    assetVersionId: publishedAssetReviews.assetVersionId,
    reviewKind: publishedAssetReviews.reviewKind,
    decision: publishedAssetReviews.decision,
    reviewerPersonId: publishedAssetReviews.reviewerPersonId,
    evidenceVersionId: publishedAssetReviews.evidenceVersionId,
  }).from(publishedAssetReviews)
    .where(inArray(publishedAssetReviews.assetVersionId, uniqueIds))
    .orderBy(desc(publishedAssetReviews.decisionOrder));
  const evidenceIds = [...new Set(reviews.flatMap((review) =>
    review.evidenceVersionId ? [review.evidenceVersionId] : [],
  ))];
  const evidenceRows = evidenceIds.length
    ? await tx.select({
        id: evidenceDocumentVersions.id,
        kindCode: evidenceDocuments.kindCode,
        verifiedAt: evidenceDocumentVersions.verifiedAt,
        verifiedByPersonId: evidenceDocumentVersions.verifiedByPersonId,
        validFrom: evidenceDocumentVersions.validFrom,
        validThrough: evidenceDocumentVersions.validThrough,
      }).from(evidenceDocumentVersions)
      .innerJoin(evidenceDocuments, eq(evidenceDocuments.id, evidenceDocumentVersions.documentId))
      .where(inArray(evidenceDocumentVersions.id, evidenceIds))
    : [];
  const evidenceById = new Map(evidenceRows.map((evidence) => [evidence.id, evidence]));
  const currentReviews = new Map<string, Map<string, (typeof reviews)[number]>>();
  for (const review of reviews) {
    const kinds = currentReviews.get(review.assetVersionId) ?? new Map<string, (typeof reviews)[number]>();
    if (!kinds.has(review.reviewKind)) {
      kinds.set(review.reviewKind, review);
      currentReviews.set(review.assetVersionId, kinds);
    }
  }
  const result = new Map<string, {
    sha256: string;
    licenseTerms: JsonValue;
    rightsEvidenceVersionId: string;
  }>();
  for (const version of versions) {
    if (version.lifecycle !== "published" || !version.sha256 || !/^[a-f0-9]{64}$/.test(version.sha256)) {
      invalid("Track assets must be published immutable versions with verified SHA-256 hashes.");
    }
    if (
      version.licenseTerms &&
      typeof version.licenseTerms === "object" &&
      !Array.isArray(version.licenseTerms) &&
      version.licenseTerms.expiresAt !== undefined
    ) {
      const expiry = version.licenseTerms.expiresAt;
      if (typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)) ||
        new Date(expiry) <= new Date()) {
        invalid("Track asset rights are expired or have an invalid expiry date.");
      }
    }
    const latest = currentReviews.get(version.id);
    for (const kind of ["academic", "rights", "accessibility"] as const) {
      if (latest?.get(kind)?.decision !== "approved") {
        invalid(`Current independent ${kind} asset review is required.`);
      }
    }
    const rightsReview = latest?.get("rights");
    const rightsEvidence = rightsReview?.evidenceVersionId
      ? evidenceById.get(rightsReview.evidenceVersionId)
      : null;
    if (
      !rightsEvidence ||
      rightsEvidence.kindCode !== "rights" ||
      !isVerifiedEvidenceCurrent({
        verifiedAt: rightsEvidence.verifiedAt,
        verifiedByPersonId: rightsEvidence.verifiedByPersonId,
        validFrom: rightsEvidence.validFrom,
        validThrough: rightsEvidence.validThrough,
        at: new Date(),
      })
    ) {
      invalid("Every track asset requires current, verified rights evidence.");
    }
    result.set(version.id, {
      sha256: version.sha256,
      licenseTerms: version.licenseTerms,
      rightsEvidenceVersionId: rightsEvidence.id,
    });
  }
  return result;
}

function assertNoPrivatePracticeFields(value: JsonValue): void {
  if (!hasNoPrivatePracticeFields(value)) {
    invalid("Private practice answers must not be stored in general instructional track content.");
  }
}

export async function createInstructionalTrackDraft(
  context: AccessContext,
  raw: z.input<typeof createInstructionalTrackDraftSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "instructional_track.author");
  const input = createInstructionalTrackDraftSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [courseVersion] = await tx.select().from(courseVersions)
      .where(eq(courseVersions.id, input.courseVersionId)).limit(1);
    if (!courseVersion || courseVersion.lifecycle !== "published") {
      invalid("Select an exact published Course version before authoring instruction.");
    }
    const [course] = await tx.select().from(courses)
      .where(eq(courses.id, courseVersion.courseId)).limit(1);
    if (!course) throw new DomainError("UNAVAILABLE", "Course publisher is unavailable.");
    assertPublisherScope(context, course.publisherOrganizationId);
    await assertTrackProvider(tx, context, {
      organizationId: course.publisherOrganizationId,
      courseId: course.id,
      capability: "instructional_track.author",
    });

    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.draft.create",
      eventType: "InstructionalTrackDraftCreated",
      entityKind: "instructional_track",
      entityId: input.trackId ?? input.requestId,
      owningOrganizationId: course.publisherOrganizationId,
      payload: input,
    }, async () => {
      let trackId = input.trackId;
      if (trackId) {
        const [existingTrack] = await tx.select().from(instructionalTracks)
          .where(eq(instructionalTracks.id, trackId)).for("update").limit(1);
        if (
          !existingTrack ||
          existingTrack.courseId !== course.id ||
          existingTrack.producerOrganizationId !== course.publisherOrganizationId ||
          existingTrack.presenterPersonId !== context.actorPersonId
        ) {
          throw new AuthorizationError("own publisher instructional track");
        }
      } else {
        const [createdTrack] = await tx.insert(instructionalTracks).values({
          courseId: course.id,
          presenterPersonId: context.actorPersonId,
          producerOrganizationId: course.publisherOrganizationId,
          title: input.title,
        }).returning({ id: instructionalTracks.id });
        trackId = createdTrack?.id;
      }
      if (!trackId) throw new DomainError("UNEXPECTED", "Instructional track identity was not created.");
      const versions = await tx.select({
        versionNo: instructionalTrackVersions.versionNo,
        lifecycle: instructionalTrackVersions.lifecycle,
        submissionManifestHash: instructionalTrackVersions.submissionManifestHash,
      }).from(instructionalTrackVersions)
        .where(eq(instructionalTrackVersions.instructionalTrackId, trackId))
        .orderBy(desc(instructionalTrackVersions.versionNo))
        .for("update");
      if (versions.some((version) => version.lifecycle === "draft" &&
        version.submissionManifestHash === null)) {
        conflict("Continue the existing instructional track draft before creating another.");
      }
      const [version] = await tx.insert(instructionalTrackVersions).values({
        instructionalTrackId: trackId,
        courseVersionId: input.courseVersionId,
        courseId: course.id,
        createdByPersonId: context.actorPersonId,
        versionNo: (versions[0]?.versionNo ?? 0) + 1,
        trackKind: input.trackKind,
      }).returning();
      if (!version) throw new DomainError("UNEXPECTED", "Instructional track version was not created.");
      const bundle = await loadDraftBundle(tx, version.id);
      return {
        trackId,
        trackVersionId: version.id,
        revision: await currentDraftRevision(tx, bundle),
      };
    });
  });
}

export async function saveInstructionalTrackDraft(
  context: AccessContext,
  raw: z.input<typeof saveInstructionalTrackDraftSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "instructional_track.author");
  const input = saveInstructionalTrackDraftSchema.parse(raw);
  return db.transaction(async (tx) => {
    const bundle = await loadDraftBundle(tx, input.trackVersionId, true);
    await assertDraftOwner(tx, context, bundle, "instructional_track.author");
    for (const material of input.materials) {
      if (material.materialKind === "practice") {
        parseStudentPracticeDefinition(material.activitySpec);
      }
      assertNoPrivatePracticeFields(material.activitySpec);
    }

    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.draft.save",
      eventType: "InstructionalTrackDraftSaved",
      entityKind: "instructional_track_version",
      entityId: bundle.version.id,
      owningOrganizationId: bundle.course.publisherOrganizationId,
      payload: input,
    }, async () => {
      if (
        bundle.version.lifecycle !== "draft" ||
        bundle.version.submissionManifestHash !== null ||
        bundle.version.createdByPersonId !== context.actorPersonId
      ) {
        conflict("Only the author may change an unsubmitted instructional track draft.");
      }
      if ((await currentDraftRevision(tx, bundle)) !== input.expectedRevision) {
        conflict("Instructional track draft changed. Reload before saving.");
      }
      if (bundle.courseVersion.lifecycle !== "published") {
        invalid("The exact Course version must remain published.");
      }
      const assetIds = [
        ...input.materials.flatMap((material) => material.assetVersionId ? [material.assetVersionId] : []),
        ...input.presentations.map((presentation) => presentation.assetVersionId),
      ];
      await assertInstructionalTrackAssetsEligible(tx, assetIds);
      await tx.delete(instructionalTrackMaterials)
        .where(eq(instructionalTrackMaterials.trackVersionId, bundle.version.id));
      await tx.delete(trackLessonPresentations)
        .where(eq(trackLessonPresentations.trackVersionId, bundle.version.id));
      if (input.materials.length) {
        await tx.insert(instructionalTrackMaterials).values(input.materials.map((material) => ({
          ...material,
          trackVersionId: bundle.version.id,
          courseVersionId: bundle.version.courseVersionId,
        })));
      }
      if (input.presentations.length) {
        await tx.insert(trackLessonPresentations).values(input.presentations.map((presentation) => ({
          ...presentation,
          trackVersionId: bundle.version.id,
          courseVersionId: bundle.version.courseVersionId,
        })));
      }
      const next = await loadDraftBundle(tx, bundle.version.id);
      return { trackVersionId: next.version.id, revision: await currentDraftRevision(tx, next) };
    });
  });
}

export async function submitInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof instructionalTrackReleaseSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "instructional_track.author");
  const input = instructionalTrackReleaseSchema.parse(raw);
  return db.transaction(async (tx) => {
    const bundle = await loadDraftBundle(tx, input.trackVersionId, true);
    await assertDraftOwner(tx, context, bundle, "instructional_track.author");
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.submit",
      eventType: "InstructionalTrackSubmitted",
      entityKind: "instructional_track_version",
      entityId: bundle.version.id,
      owningOrganizationId: bundle.course.publisherOrganizationId,
      payload: input,
    }, async () => {
      if (
        bundle.version.lifecycle !== "draft" ||
        bundle.version.submissionManifestHash !== null ||
        bundle.version.createdByPersonId !== context.actorPersonId
      ) {
        conflict("Only the author may submit an unsubmitted instructional track draft.");
      }
      const revision = await currentDraftRevision(tx, bundle);
      if (revision !== input.expectedRevision) {
        conflict("Instructional track draft changed. Reload before submitting.");
      }
      const [presentations, materials] = await Promise.all([
        tx.select().from(trackLessonPresentations)
          .where(eq(trackLessonPresentations.trackVersionId, bundle.version.id)),
        tx.select().from(instructionalTrackMaterials)
          .where(eq(instructionalTrackMaterials.trackVersionId, bundle.version.id)),
      ]);
      if (bundle.version.trackKind === "primary") {
        const lessons = await tx.select({ id: courseLessons.id }).from(courseLessons)
          .where(eq(courseLessons.courseVersionId, bundle.version.courseVersionId));
        const primaryLessonIds = new Set(
          presentations.filter((item) => item.presentationKind === "primary")
            .map((item) => item.courseLessonId),
        );
        if (!lessons.length || lessons.some((lesson) => !primaryLessonIds.has(lesson.id))) {
          invalid("A primary instructional track must present every lesson in its exact Course version.");
        }
      }
      const assetIds = [
        ...presentations.map((item) => item.assetVersionId),
        ...materials.flatMap((item) => item.assetVersionId ? [item.assetVersionId] : []),
      ];
      const assets = await assertInstructionalTrackAssetsEligible(tx, assetIds);
      const usages = buildTrackManifestUsages({ presentations, materials });
      const manifestHash = createHash("sha256")
        .update(JSON.stringify({
          trackVersionId: bundle.version.id,
          revision,
          usages: usages.map((usage) => ({
            ...usage,
            contentHash: assets.get(usage.assetVersionId)?.sha256,
            rightsEvidenceVersionId: assets.get(usage.assetVersionId)?.rightsEvidenceVersionId,
          })),
        }))
        .digest("hex");
      const [manifest] = await tx.insert(contentPublicationManifests).values({
        ownerOrganizationId: bundle.course.publisherOrganizationId,
        trackVersionId: bundle.version.id,
        manifestHash,
        createdByPersonId: context.actorPersonId,
      }).returning({ id: contentPublicationManifests.id });
      if (!manifest) throw new DomainError("UNEXPECTED", "Content manifest was not created.");
      const manifestItems = usages.map(({ assetVersionId, usageKind }) => {
        const asset = assets.get(assetVersionId);
        if (!asset) throw new DomainError("UNEXPECTED", "Eligible track asset is missing from its manifest.");
        return {
          manifestId: manifest.id,
          contentAssetVersionId: assetVersionId,
          usageKind,
          contentHash: asset.sha256,
          rightsEvidenceVersionId: asset.rightsEvidenceVersionId,
        };
      });
      await tx.insert(contentPublicationManifestItems).values(manifestItems);
      await tx.update(instructionalTrackVersions).set({
        submissionManifestHash: manifestHash,
        submittedByPersonId: context.actorPersonId,
        submittedAt: new Date(),
      }).where(eq(instructionalTrackVersions.id, bundle.version.id));
      return { trackVersionId: bundle.version.id, manifestId: manifest.id, manifestHash };
    });
  });
}

function toManifestReviewKind(
  kind: z.infer<typeof reviewKindSchema>,
): "academic" | "rights" | "accessibility" | "coverage" | "safety" {
  return kind === "safeguarding" ? "safety" : kind;
}

export async function reviewInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof reviewInstructionalTrackSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "instructional_track.review");
  const input = reviewInstructionalTrackSchema.parse(raw);
  return db.transaction(async (tx) => {
    const bundle = await loadDraftBundle(tx, input.trackVersionId, true);
    await assertDraftOwner(tx, context, bundle, "instructional_track.review");
    if (
      !bundle.version.submissionManifestHash ||
      bundle.version.submissionManifestHash !== input.expectedRevision
    ) {
      conflict("Review the exact submitted instructional track manifest.");
    }
    if (
      bundle.version.createdByPersonId === context.actorPersonId ||
      bundle.track.presenterPersonId === context.actorPersonId
    ) {
      throw new AuthorizationError("independent instructional content reviewer");
    }
    const [manifest] = await tx.select().from(contentPublicationManifests)
      .where(and(
        eq(contentPublicationManifests.trackVersionId, bundle.version.id),
        eq(contentPublicationManifests.manifestHash, input.expectedRevision),
      ))
      .limit(1);
    if (!manifest) throw new DomainError("UNAVAILABLE", "Submitted content manifest is unavailable.");
    if (input.reviewKind === "rights") {
      if (!input.evidenceVersionId) {
        invalid("Rights review requires a current verified rights evidence version.");
      }
      const [evidence] = await tx.select({
        kindCode: evidenceDocuments.kindCode,
        verifiedAt: evidenceDocumentVersions.verifiedAt,
        verifiedByPersonId: evidenceDocumentVersions.verifiedByPersonId,
        validFrom: evidenceDocumentVersions.validFrom,
        validThrough: evidenceDocumentVersions.validThrough,
      }).from(evidenceDocumentVersions)
        .innerJoin(evidenceDocuments, eq(
          evidenceDocuments.id,
          evidenceDocumentVersions.documentId,
        ))
        .where(eq(evidenceDocumentVersions.id, input.evidenceVersionId))
        .limit(1);
      if (
        !evidence ||
        evidence.kindCode !== "rights" ||
        !isVerifiedEvidenceCurrent({ ...evidence, at: new Date() })
      ) {
        invalid("Rights review evidence must be verified, current, and classified as rights.");
      }
    }

    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.review",
      eventType: "InstructionalTrackReviewed",
      entityKind: "instructional_track_version",
      entityId: bundle.version.id,
      owningOrganizationId: bundle.course.publisherOrganizationId,
      payload: input,
    }, async () => {
      await tx.insert(instructionalTrackReviews).values({
        trackVersionId: bundle.version.id,
        manifestHash: input.expectedRevision,
        reviewerPersonId: context.actorPersonId,
        reviewKind: input.reviewKind,
        decision: input.decision,
        rationale: input.rationale,
        evidenceVersionId: input.evidenceVersionId ?? null,
      });
      await tx.insert(contentManifestReviewDecisions).values({
        manifestId: manifest.id,
        reviewKind: toManifestReviewKind(input.reviewKind),
        reviewerPersonId: context.actorPersonId,
        decision: input.decision === "changes_requested" ? "rejected" : input.decision,
        evidenceVersionId: input.evidenceVersionId ?? null,
      });
      return {
        trackVersionId: bundle.version.id,
        manifestHash: input.expectedRevision,
        reviewKind: input.reviewKind,
        decision: input.decision,
      };
    });
  });
}

export async function publishInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof instructionalTrackReleaseSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "instructional_track.publish");
  const input = instructionalTrackReleaseSchema.parse(raw);
  return db.transaction(async (tx) => {
    const bundle = await loadDraftBundle(tx, input.trackVersionId, true);
    await assertDraftOwner(tx, context, bundle, "instructional_track.publish");
    if (
      !bundle.version.submissionManifestHash ||
      bundle.version.submissionManifestHash !== input.expectedRevision
    ) {
      conflict("Publish only the exact submitted instructional track manifest.");
    }
    if (
      bundle.version.createdByPersonId === context.actorPersonId ||
      bundle.track.presenterPersonId === context.actorPersonId
    ) {
      throw new AuthorizationError("independent instructional content publisher");
    }
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.publish",
      eventType: "InstructionalTrackPublished",
      entityKind: "instructional_track_version",
      entityId: bundle.version.id,
      owningOrganizationId: bundle.course.publisherOrganizationId,
      payload: input,
    }, async () => {
      const [manifest] = await tx.select().from(contentPublicationManifests)
        .where(and(
          eq(contentPublicationManifests.trackVersionId, bundle.version.id),
          eq(contentPublicationManifests.manifestHash, input.expectedRevision),
          eq(contentPublicationManifests.manifestStatus, "draft"),
        ))
        .for("update")
        .limit(1);
      if (!manifest) throw new DomainError("UNAVAILABLE", "Draft publication manifest is unavailable.");
      const reviews = await tx.select().from(instructionalTrackReviews)
        .where(and(
          eq(instructionalTrackReviews.trackVersionId, bundle.version.id),
          eq(instructionalTrackReviews.manifestHash, input.expectedRevision),
        ))
        .orderBy(desc(instructionalTrackReviews.decisionOrder));
      for (const kind of reviewKindSchema.options) {
        const latest = reviews.find((review) => review.reviewKind === kind);
        if (
          !latest ||
          latest.decision !== "approved" ||
          latest.reviewerPersonId === bundle.version.createdByPersonId ||
          latest.reviewerPersonId === bundle.track.presenterPersonId
        ) {
          invalid(`Current independent ${kind} approval is required before publication.`);
        }
      }
      await tx.update(contentPublicationManifests)
        .set({ manifestStatus: "approved" })
        .where(eq(contentPublicationManifests.id, manifest.id));
      const [published] = await tx.update(instructionalTrackVersions)
        .set({ lifecycle: "published", publishedAt: new Date() })
        .where(and(
          eq(instructionalTrackVersions.id, bundle.version.id),
          eq(instructionalTrackVersions.lifecycle, "draft"),
        ))
        .returning({ id: instructionalTrackVersions.id });
      if (!published) conflict("Instructional track version changed during publication.");
      return {
        trackVersionId: bundle.version.id,
        manifestHash: input.expectedRevision,
        lifecycle: "published",
      };
    });
  });
}

export async function withdrawInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof withdrawInstructionalTrackSchema>,
): Promise<JsonObject> {
  const input = withdrawInstructionalTrackSchema.parse(raw);
  assertAuthenticated(context, "instructional_track.withdraw");
  return db.transaction(async (tx) => {
    const bundle = await loadDraftBundle(tx, input.trackVersionId, true);
    await assertDraftOwner(tx, context, bundle, "instructional_track.withdraw");
    const legacyAccessUntil = input.legacyAccessUntil
      ? new Date(input.legacyAccessUntil)
      : null;
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.withdraw",
      eventType: "InstructionalTrackWithdrawn",
      entityKind: "instructional_track_version",
      entityId: bundle.version.id,
      owningOrganizationId: bundle.course.publisherOrganizationId,
      payload: input,
    }, async () => {
      if (bundle.version.lifecycle !== "published") {
        invalid("Only published instructional track versions may be withdrawn.");
      }
      const effectiveAt = new Date();
      if (
        legacyAccessUntil &&
        (input.withdrawalKind !== "routine_retirement" || legacyAccessUntil <= effectiveAt)
      ) {
        invalid("Legacy access is allowed only for a future routine-retirement deadline.");
      }
      if (legacyAccessUntil) {
        const [materials, presentations] = await Promise.all([
          tx.select({ assetVersionId: instructionalTrackMaterials.assetVersionId })
            .from(instructionalTrackMaterials)
            .where(eq(instructionalTrackMaterials.trackVersionId, bundle.version.id)),
          tx.select({ assetVersionId: trackLessonPresentations.assetVersionId })
            .from(trackLessonPresentations)
            .where(eq(trackLessonPresentations.trackVersionId, bundle.version.id)),
        ]);
        const assetIds = [...new Set([
          ...materials.flatMap((item) => item.assetVersionId ? [item.assetVersionId] : []),
          ...presentations.map((item) => item.assetVersionId),
        ])];
        if (!assetIds.length) invalid("Routine retirement grace requires known content rights.");
        const assets = await tx.select({
          id: contentAssetVersions.id,
          licenseTerms: contentAssetVersions.licenseTerms,
        }).from(contentAssetVersions).where(inArray(contentAssetVersions.id, assetIds));
        if (assets.length !== assetIds.length) {
          invalid("Routine retirement rights could not be verified for every track asset.");
        }
        for (const asset of assets) {
          const expiresAt = asset.licenseTerms && typeof asset.licenseTerms === "object" &&
            !Array.isArray(asset.licenseTerms)
            ? asset.licenseTerms.expiresAt
            : undefined;
          if (
            typeof expiresAt !== "string" ||
            !Number.isFinite(Date.parse(expiresAt)) ||
            new Date(expiresAt) < legacyAccessUntil
          ) {
            invalid("Legacy access cannot extend beyond explicit asset license expiry.");
          }
        }
      }
      const currentRevision = await currentDraftRevision(tx, bundle);
      await tx.insert(contentWithdrawals).values({
        trackVersionId: bundle.version.id,
        withdrawalKind: input.withdrawalKind,
        effectiveAt,
        legacyAccessUntil,
        reason: input.reason,
        authorizedByPersonId: context.actorPersonId,
      });
      return {
        trackVersionId: bundle.version.id,
        withdrawalKind: input.withdrawalKind,
        effectiveAt: effectiveAt.toISOString(),
        legacyAccessUntil: legacyAccessUntil?.toISOString() ?? null,
        revision: currentRevision,
      };
    });
  });
}
