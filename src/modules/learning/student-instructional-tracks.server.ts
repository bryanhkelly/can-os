import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contentPublicationManifests,
  contentPublicationManifestItems,
  contentManifestReviewDecisions,
  contentAssetVersions,
  contentWithdrawals,
  courses,
  courseLessons,
  courseUnits,
  deploymentOfferingAdoptions,
  educationOperationOrganizationRoles,
  evidenceDocuments,
  evidenceDocumentVersions,
  enrollments,
  formativePracticeAttempts,
  formativePracticeResponses,
  guardianAuthorities,
  instructionalTrackMaterials,
  instructionalTrackPolicyVersions,
  instructionalTrackPolicyWithdrawals,
  instructionalTrackReviews,
  instructionalTracks,
  instructionalTrackVersions,
  courseVersions,
  learnerCourseAttempts,
  learnerLessonProgress,
  learnerProfiles,
  learnerTrackSelections,
  noncreditRegistrations,
  programDeployments,
  trackDistributionAuthorizations,
  trackLessonPresentations,
  type JsonObject,
  type JsonValue,
} from "@/db/canonical-v301";
import { assertSectionScope, AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import {
  assertCurrentPracticeSelection,
  buildTrackManifestUsages,
  canAccessStudentTrackMaterial,
  decideInstructionalTrackSelection,
  evaluateInstructionalTrackPolicy,
  isVerifiedEvidenceCurrent,
  parseStudentPracticeDefinition,
  projectRecordedCourseLessons,
  recordedPracticeResponsesComplete,
  snapshotRecordedPracticeAnswers,
  trackContentAvailable,
  instructionalTrackAssetStorageKey,
  type RecordedPracticeAnswer,
  type StudentPracticeDefinition,
} from "@/domain/instructional-tracks";
import { signPrivateObjectUrl } from "@/platform/storage/r2";
import {
  assertInstructionalTrackAssetsEligible,
  type TrackTransaction,
} from "./instructional-track-authoring.server";
import { runInstructionalTrackCommand } from "./instructional-track-command.server";
import {
  assertCurrentTrackPresenter,
  assertLearningParticipantRole,
} from "./instructional-track-access.server";

const uuidSchema = z.string().uuid();
export const readInstructionalTrackSchema = z.object({ courseAttemptId: uuidSchema }).strict();
export const instructionalTrackAssetDownloadSchema = readInstructionalTrackSchema.extend({
  assetVersionId: uuidSchema,
}).strict();
const instructionalTrackAssetKeyPattern =
  /^learning\/instructional-track\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const selectInstructionalTrackSchema = readInstructionalTrackSchema.extend({
  requestId: uuidSchema,
  trackVersionId: uuidSchema,
  expectedRevision: z.number().int().min(0),
  switchReason: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();
export const completeRecordedLessonSchema = readInstructionalTrackSchema.extend({
  requestId: uuidSchema,
  lessonId: uuidSchema,
  expectedRevision: z.number().int().min(1),
}).strict();

export const recordFormativePracticeSchema = z.object({
  requestId: uuidSchema,
  courseAttemptId: uuidSchema,
  courseVersionId: uuidSchema,
  trackVersionId: uuidSchema,
  materialId: uuidSchema,
  expectedRevision: z.number().int().min(1),
  responses: z.array(z.object({
    promptKey: z.string().trim().min(1).max(100),
    response: z.string().max(20_000),
  }).strict()).max(100),
}).strict();

type SelectionSource = "learner" | "guardian";
type CourseAttempt = typeof learnerCourseAttempts.$inferSelect;
type AuthorizedParticipant = {
  selectionSource: SelectionSource;
  participantPersonId: string;
  learnerId: string | null;
};

function assertAuthenticated(
  context: AccessContext,
  kind: "learner" | "learner_or_guardian",
): asserts context is AccessContext & {
  actorPersonId: string;
} {
  assertLearningParticipantRole(context, kind);
}

function invalid(message: string): never {
  throw new DomainError("VALIDATION_FAILED", message);
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

async function loadAuthorizedParticipant(
  tx: TrackTransaction,
  context: AccessContext,
  attemptId: string,
  allowCompletedHistory = false,
): Promise<{ attempt: CourseAttempt; participant: AuthorizedParticipant }> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  const [attempt] = await tx.select().from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.id, attemptId))
    .limit(1);
  if (
    !attempt ||
    (attempt.status !== "active" && !(allowCompletedHistory && attempt.status === "completed"))
  ) {
    throw new DomainError("UNAVAILABLE", "Active course participation is unavailable.");
  }
  if (attempt.sectionId) assertSectionScope(context, attempt.sectionId);

  if (attempt.enrollmentId) {
    const [enrollment] = await tx.select().from(enrollments)
      .where(and(
        eq(enrollments.id, attempt.enrollmentId),
        eq(enrollments.deploymentId, attempt.deploymentId),
      ))
      .limit(1);
    if (
      !enrollment ||
      (enrollment.status !== "active" &&
        !(allowCompletedHistory && enrollment.status === "completed"))
    ) {
      throw new AuthorizationError("current school enrollment");
    }
    const [learner] = await tx.select().from(learnerProfiles)
      .where(eq(learnerProfiles.id, enrollment.learnerId))
      .limit(1);
    if (!learner) throw new DomainError("UNAVAILABLE", "Learner identity is unavailable.");
    if (learner.personId === context.actorPersonId) {
      assertLearningParticipantRole(context, "learner");
      return {
        attempt,
        participant: {
          selectionSource: "learner",
          participantPersonId: learner.personId,
          learnerId: learner.id,
        },
      };
    }
    assertLearningParticipantRole(context, "guardian");
    const now = new Date();
    const [authority] = await tx.select().from(guardianAuthorities)
      .where(and(
        eq(guardianAuthorities.guardianPersonId, context.actorPersonId),
        eq(guardianAuthorities.learnerId, learner.id),
        lte(guardianAuthorities.startsAt, now),
        or(
          isNull(guardianAuthorities.endsAt),
          gt(guardianAuthorities.endsAt, now),
        ),
      ))
      .limit(1);
    if (!authority?.verifiedAt || authority.verifiedAt > now) {
      throw new AuthorizationError("verified current guardian relationship");
    }
    return {
      attempt,
      participant: {
        selectionSource: "guardian",
        participantPersonId: context.actorPersonId,
        learnerId: learner.id,
      },
    };
  }

  if (attempt.noncreditRegistrationId) {
    assertLearningParticipantRole(context, "learner");
    const [registration] = await tx.select().from(noncreditRegistrations)
      .where(and(
        eq(noncreditRegistrations.id, attempt.noncreditRegistrationId),
        eq(noncreditRegistrations.deploymentId, attempt.deploymentId),
      ))
      .limit(1);
    if (
      !registration ||
      registration.participantPersonId !== context.actorPersonId ||
      (
        !["registered", "active"].includes(registration.status) &&
        !(allowCompletedHistory && registration.status === "completed")
      )
    ) {
      throw new AuthorizationError("active noncredit participant registration");
    }
    return {
      attempt,
      participant: {
        selectionSource: "learner",
        participantPersonId: registration.participantPersonId,
        learnerId: registration.learnerId,
      },
    };
  }
  throw new DomainError("UNAVAILABLE", "Course participation has no canonical registration source.");
}

async function loadCoursePublisherOrganizationId(
  tx: TrackTransaction,
  courseVersionId: string,
): Promise<string> {
  const [courseVersion] = await tx.select({ courseId: courseVersions.courseId })
    .from(courseVersions)
    .where(eq(courseVersions.id, courseVersionId))
    .limit(1);
  if (!courseVersion) throw new DomainError("UNAVAILABLE", "Course version is unavailable.");
  const [course] = await tx.select({ publisherOrganizationId: courses.publisherOrganizationId })
    .from(courses)
    .where(eq(courses.id, courseVersion.courseId))
    .limit(1);
  if (!course) throw new DomainError("UNAVAILABLE", "Course publisher is unavailable.");
  return course.publisherOrganizationId;
}

async function loadCurrentPolicy(
  tx: TrackTransaction,
  attempt: CourseAttempt,
  source: SelectionSource,
  action: "student_choice" | "practice" | "delivery",
) {
  const now = new Date();
  const policies = await tx.select().from(instructionalTrackPolicyVersions)
    .where(and(
      eq(instructionalTrackPolicyVersions.deploymentId, attempt.deploymentId),
      eq(instructionalTrackPolicyVersions.adoptionId, attempt.adoptionId),
      eq(instructionalTrackPolicyVersions.offeringVersionId, attempt.offeringVersionId),
      eq(instructionalTrackPolicyVersions.courseVersionId, attempt.courseVersionId),
      eq(instructionalTrackPolicyVersions.lifecycle, "published"),
    ))
    .orderBy(desc(instructionalTrackPolicyVersions.versionNo));
  const policy = policies.find((candidate) =>
    candidate.effectiveFrom <= now &&
    (!candidate.effectiveThrough || candidate.effectiveThrough > now),
  );
  if (!policy) throw new DomainError("FORBIDDEN", `No current instructional policy permits ${action}.`);

  const [withdrawal] = await tx.select().from(instructionalTrackPolicyWithdrawals)
    .where(and(
      eq(instructionalTrackPolicyWithdrawals.policyVersionId, policy.id),
      lte(instructionalTrackPolicyWithdrawals.effectiveAt, now),
    ))
    .orderBy(desc(instructionalTrackPolicyWithdrawals.effectiveAt))
    .limit(1);
  const decision = evaluateInstructionalTrackPolicy({
    policyVersionId: policy.id,
    lifecycle: policy.lifecycle,
    deploymentId: attempt.deploymentId,
    adoptionId: attempt.adoptionId,
    offeringVersionId: attempt.offeringVersionId,
    courseVersionId: attempt.courseVersionId,
    policyDeploymentId: policy.deploymentId,
    policyAdoptionId: policy.adoptionId,
    policyOfferingVersionId: policy.offeringVersionId,
    policyCourseVersionId: policy.courseVersionId,
    effectiveFrom: policy.effectiveFrom,
    effectiveThrough: policy.effectiveThrough,
    withdrawnAt: withdrawal?.effectiveAt ?? null,
    deliveryEnabled: policy.deliveryEnabled,
    practiceEnabled: policy.practiceEnabled,
    studentChoiceEnabled: policy.studentChoiceEnabled,
    selectionPolicy: policy.selectionPolicy,
    selectionSource: source === "guardian" ? "guardian" : "learner",
    now,
    action,
  });
  if (decision.status !== "allowed") {
    throw new DomainError("FORBIDDEN", `No current instructional policy permits ${action}.`);
  }
  return policy;
}

async function assertCurrentRightsEvidence(
  tx: TrackTransaction,
  evidenceVersionId: string | null,
  at: Date,
): Promise<void> {
  if (!evidenceVersionId) {
    throw new DomainError("UNAVAILABLE", "Verified current content-rights evidence is unavailable.");
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
    .where(eq(evidenceDocumentVersions.id, evidenceVersionId))
    .limit(1);
  if (
    !evidence ||
    evidence.kindCode !== "rights" ||
    !isVerifiedEvidenceCurrent({ ...evidence, at })
  ) {
    throw new DomainError("UNAVAILABLE", "Verified current content-rights evidence is unavailable.");
  }
}

async function assertTrackAvailable(
  tx: TrackTransaction,
  attempt: CourseAttempt,
  trackVersionId: string,
  source: SelectionSource,
  action: "student_choice" | "practice" | "delivery",
  selectionCreatedAt: Date | null,
) {
  const policy = await loadCurrentPolicy(tx, attempt, source, action);
  const [version] = await tx.select().from(instructionalTrackVersions)
    .where(and(
      eq(instructionalTrackVersions.id, trackVersionId),
      eq(instructionalTrackVersions.courseVersionId, attempt.courseVersionId),
      eq(instructionalTrackVersions.lifecycle, "published"),
    ))
    .limit(1);
  if (!version) throw new DomainError("UNAVAILABLE", "Published instruction for this Course version is unavailable.");
  const [track] = await tx.select().from(instructionalTracks)
    .where(eq(instructionalTracks.id, version.instructionalTrackId))
    .limit(1);
  if (!track) throw new DomainError("UNAVAILABLE", "Instructional track identity is unavailable.");
  if (!track.presenterPersonId || !track.producerOrganizationId) {
    throw new DomainError("UNAVAILABLE", "A current verified provider and presenter are required.");
  }
  await assertCurrentTrackPresenter(tx, {
    personId: track.presenterPersonId,
    organizationId: track.producerOrganizationId,
    courseId: version.courseId,
  });
  if (!version.submissionManifestHash) {
    throw new DomainError("UNAVAILABLE", "Submitted instructional track manifest is unavailable.");
  }
  const [manifest] = await tx.select({
    id: contentPublicationManifests.id,
    manifestHash: contentPublicationManifests.manifestHash,
  })
    .from(contentPublicationManifests)
    .where(and(
      eq(contentPublicationManifests.trackVersionId, version.id),
      eq(contentPublicationManifests.manifestHash, version.submissionManifestHash),
      eq(contentPublicationManifests.manifestStatus, "approved"),
    ))
    .limit(1);
  if (!manifest) throw new DomainError("UNAVAILABLE", "Approved publication manifest is unavailable.");
  const now = new Date();
  const [trackReviewRows, manifestReviewRows] = await Promise.all([
    tx.select().from(instructionalTrackReviews)
      .where(and(
        eq(instructionalTrackReviews.trackVersionId, version.id),
        eq(instructionalTrackReviews.manifestHash, version.submissionManifestHash),
      ))
      .orderBy(desc(instructionalTrackReviews.decisionOrder)),
    tx.select().from(contentManifestReviewDecisions)
      .where(eq(contentManifestReviewDecisions.manifestId, manifest.id))
      .orderBy(desc(contentManifestReviewDecisions.decisionOrder)),
  ]);
  const trackReviewKinds = version.trackKind === "primary"
    ? ["academic", "rights", "accessibility", "coverage", "safeguarding"] as const
    : ["academic", "rights", "accessibility", "safeguarding"] as const;
  const latestTrackReviews = new Map<string, (typeof trackReviewRows)[number]>();
  for (const review of trackReviewRows) {
    if (!latestTrackReviews.has(review.reviewKind)) {
      latestTrackReviews.set(review.reviewKind, review);
    }
  }
  for (const kind of trackReviewKinds) {
    const review = latestTrackReviews.get(kind);
    if (
      !review ||
      review.decision !== "approved" ||
      review.reviewerPersonId === version.createdByPersonId ||
      review.reviewerPersonId === track.presenterPersonId
    ) {
      throw new DomainError("UNAVAILABLE", "A current independent instructional review is unavailable.");
    }
    if (kind === "rights") {
      await assertCurrentRightsEvidence(tx, review.evidenceVersionId, now);
    }
  }
  const latestManifestReviews = new Map<string, (typeof manifestReviewRows)[number]>();
  for (const review of manifestReviewRows) {
    if (!latestManifestReviews.has(review.reviewKind)) {
      latestManifestReviews.set(review.reviewKind, review);
    }
  }
  for (const kind of ["academic", "rights", "accessibility"] as const) {
    const review = latestManifestReviews.get(kind);
    if (
      !review ||
      review.decision !== "approved" ||
      review.reviewerPersonId === version.createdByPersonId ||
      review.reviewerPersonId === track.presenterPersonId
    ) {
      throw new DomainError("UNAVAILABLE", "A current independent content-manifest review is unavailable.");
    }
    if (kind === "rights") {
      await assertCurrentRightsEvidence(tx, review.evidenceVersionId, now);
    }
  }

  const [deployment, adoption] = await Promise.all([
    tx.select().from(programDeployments)
      .where(eq(programDeployments.id, attempt.deploymentId)).limit(1),
    tx.select().from(deploymentOfferingAdoptions)
      .where(and(
        eq(deploymentOfferingAdoptions.id, attempt.adoptionId),
        eq(deploymentOfferingAdoptions.deploymentId, attempt.deploymentId),
        eq(deploymentOfferingAdoptions.offeringVersionId, attempt.offeringVersionId),
      ))
      .limit(1),
  ]);
  if (
    !deployment[0] ||
    deployment[0].status !== "active" ||
    !adoption[0] ||
    adoption[0].approvalStatus !== "approved"
  ) {
    throw new DomainError("FORBIDDEN", "Approved Deployment adoption is required for instruction delivery.");
  }
  if (
    adoption[0].validFrom > now ||
    (adoption[0].validThrough && adoption[0].validThrough <= now)
  ) {
    throw new DomainError("FORBIDDEN", "Current Deployment adoption is required for instruction delivery.");
  }
  const rights = await tx.select().from(trackDistributionAuthorizations)
    .innerJoin(
      evidenceDocumentVersions,
      eq(trackDistributionAuthorizations.rightsEvidenceVersionId, evidenceDocumentVersions.id),
    )
    .where(and(
      eq(trackDistributionAuthorizations.trackVersionId, version.id),
      eq(trackDistributionAuthorizations.status, "approved"),
      lte(trackDistributionAuthorizations.validFrom, now),
      or(
        isNull(trackDistributionAuthorizations.validThrough),
        gt(trackDistributionAuthorizations.validThrough, now),
      ),
    ));
  let distributionApproved = false;
    for (const rightRecord of rights) {
      const right = rightRecord.track_distribution_authorizations;
      const evidence = rightRecord.evidence_document_versions;
      if (right.approvedOfferingId && right.approvedOfferingId !== deployment[0].offeringId) continue;
      if (right.approvedOperationId && right.approvedOperationId !== deployment[0].operationId) continue;
      if (
        right.geographicAreaId ||
        !isVerifiedEvidenceCurrent({
          verifiedAt: evidence.verifiedAt,
          verifiedByPersonId: evidence.verifiedByPersonId,
          validFrom: evidence.validFrom,
          validThrough: evidence.validThrough,
          at: now,
        })
      ) continue;
      if (right.approvedOrganizationId) {
        const [role] = await tx.select({ id: educationOperationOrganizationRoles.id })
          .from(educationOperationOrganizationRoles)
          .where(and(
            or(
              eq(educationOperationOrganizationRoles.roleCode, "academic_provider"),
              eq(educationOperationOrganizationRoles.roleCode, "instructor_provider"),
              eq(educationOperationOrganizationRoles.roleCode, "publisher"),
            ),
            eq(educationOperationOrganizationRoles.operationId, deployment[0].operationId),
            eq(educationOperationOrganizationRoles.organizationId, right.approvedOrganizationId),
            eq(educationOperationOrganizationRoles.status, "approved"),
            lte(educationOperationOrganizationRoles.validFrom, now),
            or(
              isNull(educationOperationOrganizationRoles.validThrough),
              gt(educationOperationOrganizationRoles.validThrough, now),
            ),
          ))
        .limit(1);
      if (!role) continue;
    }
    distributionApproved = true;
    break;
  }
  if (!distributionApproved) {
    throw new DomainError("FORBIDDEN", "Current content distribution authorization is required.");
  }

  const [materials, presentations] = await Promise.all([
    tx.select().from(instructionalTrackMaterials)
      .where(eq(instructionalTrackMaterials.trackVersionId, version.id)),
    tx.select().from(trackLessonPresentations)
      .where(eq(trackLessonPresentations.trackVersionId, version.id)),
  ]);
  const assetIds = [...new Set([
    ...materials.flatMap((item) => item.assetVersionId ? [item.assetVersionId] : []),
    ...presentations.map((item) => item.assetVersionId),
  ])];
  const eligibleAssets = await assertInstructionalTrackAssetsEligible(tx, assetIds);
  const expectedManifestItems = buildTrackManifestUsages({ presentations, materials });
  const actualManifestItems = await tx.select({
    assetVersionId: contentPublicationManifestItems.contentAssetVersionId,
    usageKind: contentPublicationManifestItems.usageKind,
    contentHash: contentPublicationManifestItems.contentHash,
    rightsEvidenceVersionId: contentPublicationManifestItems.rightsEvidenceVersionId,
  }).from(contentPublicationManifestItems)
    .where(eq(contentPublicationManifestItems.manifestId, manifest.id));
  if (
    expectedManifestItems.length !== actualManifestItems.length ||
    expectedManifestItems.some((expected) => {
      const asset = eligibleAssets.get(expected.assetVersionId);
      return !asset || !actualManifestItems.some((actual) =>
        actual.assetVersionId === expected.assetVersionId &&
        actual.usageKind === expected.usageKind &&
        actual.contentHash === asset.sha256 &&
        actual.rightsEvidenceVersionId === asset.rightsEvidenceVersionId,
      );
    })
  ) {
    throw new DomainError("UNAVAILABLE", "The approved content manifest no longer matches current assets and rights.");
  }
  const withdrawalPredicates = [
    eq(contentWithdrawals.trackVersionId, version.id),
    eq(contentWithdrawals.courseVersionId, attempt.courseVersionId),
    eq(contentWithdrawals.offeringVersionId, attempt.offeringVersionId),
  ];
  if (assetIds.length) {
    withdrawalPredicates.push(inArray(contentWithdrawals.assetVersionId, assetIds));
  }
  const withdrawals = await tx.select().from(contentWithdrawals)
    .where(or(...withdrawalPredicates));
  const restrictionRows = withdrawals.filter((row) => row.effectiveAt <= now);
  if (!trackContentAvailable({
    lifecycle: "published",
    rightsExpireAt: null,
    now,
    selectionCreatedAt,
    restrictions: restrictionRows.map((row) => ({
      kind: row.withdrawalKind,
      effectiveAt: row.effectiveAt,
      legacyAccessUntil: row.legacyAccessUntil,
    })),
  })) {
    throw new DomainError("UNAVAILABLE", "Instructional content is withdrawn or outside its allowed legacy period.");
  }
  return { policy, version, track, materials, presentations };
}

export async function listAvailableInstructionalTracks(
  context: AccessContext,
  raw: z.input<typeof readInstructionalTrackSchema>,
): Promise<{
  choices: Array<{ trackVersionId: string; title: string; presenterPersonId: string | null; policyVersionId: string; allowSwitching: boolean }>;
  blocked: Array<{ trackVersionId: string; reason: string }>;
  selection: { trackVersionId: string; revision: number; policyVersionId: string } | null;
}> {
  assertAuthenticated(context, "learner_or_guardian");
  const input = readInstructionalTrackSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { attempt, participant } = await loadAuthorizedParticipant(tx, context, input.courseAttemptId);
    const candidates = await tx.select({
      trackVersionId: instructionalTrackVersions.id,
      presenterPersonId: instructionalTracks.presenterPersonId,
      title: instructionalTracks.title,
    }).from(instructionalTrackVersions)
      .innerJoin(
        instructionalTracks,
        eq(instructionalTracks.id, instructionalTrackVersions.instructionalTrackId),
      )
      .where(and(
        eq(instructionalTrackVersions.courseVersionId, attempt.courseVersionId),
        eq(instructionalTrackVersions.lifecycle, "published"),
        eq(instructionalTrackVersions.trackKind, "primary"),
      ));
    const [selection] = await tx.select({
      trackVersionId: learnerTrackSelections.trackVersionId,
      revision: learnerTrackSelections.revision,
      policyVersionId: learnerTrackSelections.policyVersionId,
    }).from(learnerTrackSelections)
      .where(and(
        eq(learnerTrackSelections.courseAttemptId, attempt.id),
        isNull(learnerTrackSelections.supersededAt),
      ))
      .limit(1);
    const choices: Array<{ trackVersionId: string; title: string; presenterPersonId: string | null; policyVersionId: string; allowSwitching: boolean }> = [];
    const blocked: Array<{ trackVersionId: string; reason: string }> = [];
    for (const candidate of candidates) {
      try {
        const eligible = await assertTrackAvailable(
          tx,
          attempt,
          candidate.trackVersionId,
          participant.selectionSource,
          "student_choice",
          null,
        );
        choices.push({ ...candidate, policyVersionId: eligible.policy.id, allowSwitching: eligible.policy.allowSwitching });
      } catch (error) {
        if (!(error instanceof DomainError) && !(error instanceof AuthorizationError)) throw error;
        blocked.push({
          trackVersionId: candidate.trackVersionId,
          reason: error instanceof DomainError ? error.code : "FORBIDDEN",
        });
      }
    }
    return { choices, blocked, selection: selection ?? null };
  });
}

export async function readSelectedInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof readInstructionalTrackSchema>,
): Promise<{
  courseAttemptId: string;
  courseVersionId: string;
  sectionId: string | null;
  canManageProgress: boolean;
  selection: {
    id: string;
    trackVersionId: string;
    revision: number;
    selectedAt: Date;
    selectedByPersonId: string | null;
    selectionSource: string;
  };
  track: { title: string; presenterPersonId: string | null };
  lessons: Array<{
    id: string;
    courseUnitId: string;
    title: string;
    lessonOrder: number;
    progress: { status: string; observedAt: Date } | null;
    presentations: Array<{
      assetVersionId: string;
      presentationKind: string;
      ordinal: number;
      accessibilityNotes: JsonValue;
    }>;
  }>;
  materials: Array<{
    id: string;
    courseUnitId: string;
    assetVersionId: string | null;
    materialKind: string;
    practice: StudentPracticeDefinition | null;
  }>;
}> {
  assertAuthenticated(context, "learner_or_guardian");
  const input = readInstructionalTrackSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { attempt, participant } = await loadAuthorizedParticipant(
      tx,
      context,
      input.courseAttemptId,
    );
    const [selection] = await tx.select().from(learnerTrackSelections)
      .where(and(
        eq(learnerTrackSelections.courseAttemptId, attempt.id),
        isNull(learnerTrackSelections.supersededAt),
      ))
      .limit(1);
    if (!selection) {
      throw new DomainError("UNAVAILABLE", "Select an instructional track before opening lessons.");
    }

    const eligible = await assertTrackAvailable(
      tx,
      attempt,
      selection.trackVersionId,
      participant.selectionSource,
      "delivery",
      selection.selectedAt,
    );
    if (selection.policyVersionId !== eligible.policy.id) {
      conflict("The instructional policy changed after track selection.");
    }

    const [lessons, progress] = await Promise.all([
      tx.select({
        id: courseLessons.id,
        courseUnitId: courseLessons.courseUnitId,
        title: courseLessons.title,
        lessonOrder: courseLessons.lessonOrder,
      }).from(courseLessons)
        .where(eq(courseLessons.courseVersionId, attempt.courseVersionId))
        .orderBy(courseLessons.lessonOrder),
      tx.select({
        lessonId: learnerLessonProgress.lessonId,
        status: learnerLessonProgress.status,
        observedAt: learnerLessonProgress.observedAt,
      }).from(learnerLessonProgress)
        .where(and(
          eq(learnerLessonProgress.courseAttemptId, attempt.id),
          eq(learnerLessonProgress.courseVersionId, attempt.courseVersionId),
        )),
    ]);
    const recordedLessons = projectRecordedCourseLessons({
      lessons,
      progress,
      presentations: eligible.presentations,
    });

    return {
      courseAttemptId: attempt.id,
      courseVersionId: attempt.courseVersionId,
      sectionId: attempt.sectionId,
      canManageProgress: participant.selectionSource === "learner",
      selection: {
        id: selection.id,
        trackVersionId: selection.trackVersionId,
        revision: selection.revision,
        selectedAt: selection.selectedAt,
        selectedByPersonId: selection.selectedByPersonId,
        selectionSource: selection.selectionSource,
      },
      track: {
        title: eligible.track.title,
        presenterPersonId: eligible.track.presenterPersonId,
      },
      lessons: recordedLessons,
      materials: eligible.materials
        .filter((material) => canAccessStudentTrackMaterial(
          material.materialKind,
          eligible.policy.practiceEnabled,
        ))
        .map((material) => ({
          id: material.id,
          courseUnitId: material.courseUnitId,
          assetVersionId: material.assetVersionId,
          materialKind: material.materialKind,
          practice: material.materialKind === "practice"
            ? parseStudentPracticeDefinition(material.activitySpec)
            : null,
        })),
    };
  });
}

export async function getSelectedInstructionalTrackAssetDownload(
  context: AccessContext,
  raw: z.input<typeof instructionalTrackAssetDownloadSchema>,
): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
  assertAuthenticated(context, "learner_or_guardian");
  const input = instructionalTrackAssetDownloadSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { attempt, participant } = await loadAuthorizedParticipant(
      tx,
      context,
      input.courseAttemptId,
    );
    const [selection] = await tx.select().from(learnerTrackSelections)
      .where(and(
        eq(learnerTrackSelections.courseAttemptId, attempt.id),
        isNull(learnerTrackSelections.supersededAt),
      ))
      .limit(1);
    if (!selection) {
      throw new DomainError("UNAVAILABLE", "Select an instructional track before opening its resources.");
    }

    const eligible = await assertTrackAvailable(
      tx,
      attempt,
      selection.trackVersionId,
      participant.selectionSource,
      "delivery",
      selection.selectedAt,
    );
    if (selection.policyVersionId !== eligible.policy.id) {
      conflict("The instructional policy changed after track selection.");
    }
    const selectedTrackUsesAsset = eligible.presentations.some(
      (presentation) => presentation.assetVersionId === input.assetVersionId,
    ) || eligible.materials.some((material) =>
      canAccessStudentTrackMaterial(material.materialKind, eligible.policy.practiceEnabled) &&
      material.assetVersionId === input.assetVersionId
    );
    if (!selectedTrackUsesAsset) {
      throw new DomainError("UNAVAILABLE", "The requested resource is not part of the selected instruction.");
    }

    const [asset] = await tx.select({
      storageReference: contentAssetVersions.storageReference,
    }).from(contentAssetVersions)
      .where(and(
        eq(contentAssetVersions.id, input.assetVersionId),
        eq(contentAssetVersions.lifecycle, "published"),
      ))
      .limit(1);
    const expectedKey = instructionalTrackAssetStorageKey(input.assetVersionId);
    if (!asset || asset.storageReference !== expectedKey ||
      !instructionalTrackAssetKeyPattern.test(asset.storageReference)) {
      throw new DomainError("UNAVAILABLE", "The approved private instructional resource is unavailable.");
    }

    return {
      downloadUrl: signPrivateObjectUrl({
        method: "GET",
        key: asset.storageReference,
        keyPattern: instructionalTrackAssetKeyPattern,
        expiresSeconds: 30,
      }),
      expiresInSeconds: 30,
    };
  });
}

export async function selectInstructionalTrack(
  context: AccessContext,
  raw: z.input<typeof selectInstructionalTrackSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "learner_or_guardian");
  const input = selectInstructionalTrackSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(learnerCourseAttempts)
      .where(eq(learnerCourseAttempts.id, input.courseAttemptId))
      .for("update")
      .limit(1);
    if (!attempt) throw new DomainError("UNAVAILABLE", "Course attempt is unavailable.");
    const { participant } = await loadAuthorizedParticipant(tx, context, input.courseAttemptId);
    const owningOrganizationId = await loadCoursePublisherOrganizationId(tx, attempt.courseVersionId);
    if (attempt.sectionId) assertSectionScope(context, attempt.sectionId);
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.track.select",
      eventType: "InstructionalTrackSelected",
      entityKind: "learner_course_attempt",
      entityId: attempt.id,
      owningOrganizationId,
      payload: input,
    }, async () => {
      const selections = await tx.select().from(learnerTrackSelections)
        .where(eq(learnerTrackSelections.courseAttemptId, attempt.id))
        .for("update");
      const activeSelections = selections.filter((selection) => selection.supersededAt === null);
      if (activeSelections.length > 1) {
        throw new DomainError("UNEXPECTED", "Multiple active instructional track selections were found.");
      }
      const active = activeSelections[0];
      const currentRevision = selections.reduce(
        (latest, selection) => Math.max(latest, selection.revision),
        0,
      );
      if (currentRevision !== input.expectedRevision) {
        conflict("Recorded teacher selection changed. Reload before selecting another track.");
      }
      const eligible = await assertTrackAvailable(
        tx,
        attempt,
        input.trackVersionId,
        participant.selectionSource,
        "student_choice",
        null,
      );
      const lastSelection = selections.reduce<(typeof selections)[number] | null>(
        (latest, selection) => !latest || selection.revision > latest.revision ? selection : latest,
        null,
      );
      const decision = decideInstructionalTrackSelection({
        current: active
          ? { trackVersionId: active.trackVersionId, policyVersionId: active.policyVersionId }
          : null,
        lastTrackVersionId: lastSelection?.trackVersionId ?? null,
        requestedTrackVersionId: input.trackVersionId,
        policyVersionId: eligible.policy.id,
        allowSwitching: eligible.policy.allowSwitching,
      });
      if (decision === "switch_denied") {
        throw new DomainError("FORBIDDEN", "Current instructional policy does not allow switching.");
      }
      if (decision === "reuse" && active) {
        return {
          courseAttemptId: attempt.id,
          selectionId: active.id,
          trackVersionId: input.trackVersionId,
          revision: currentRevision,
          policyVersionId: eligible.policy.id,
        };
      }
      const selectedAt = new Date();
      if (active) {
        await tx.update(learnerTrackSelections)
          .set({ supersededAt: selectedAt })
          .where(eq(learnerTrackSelections.id, active.id));
      }
      const [selection] = await tx.insert(learnerTrackSelections).values({
        courseAttemptId: attempt.id,
        courseVersionId: attempt.courseVersionId,
        trackVersionId: input.trackVersionId,
        policyVersionId: eligible.policy.id,
        revision: currentRevision + 1,
        selectedAt,
        selectedByPersonId: participant.participantPersonId,
        selectionSource: participant.selectionSource,
        switchReason: input.switchReason ?? null,
      }).returning({ id: learnerTrackSelections.id });
      if (!selection) throw new DomainError("UNEXPECTED", "Instructional track selection was not saved.");
      return {
        courseAttemptId: attempt.id,
        selectionId: selection.id,
        trackVersionId: input.trackVersionId,
        revision: currentRevision + 1,
        policyVersionId: eligible.policy.id,
      };
    });
  });
}

/**
 * Canonical lesson completion is keyed by Course attempt and Lesson.
 * A different recorded presenter never creates another official progress row.
 */
export async function completeRecordedLesson(
  context: AccessContext,
  raw: z.input<typeof completeRecordedLessonSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "learner");
  const input = completeRecordedLessonSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(learnerCourseAttempts)
      .where(eq(learnerCourseAttempts.id, input.courseAttemptId))
      .for("update")
      .limit(1);
    if (!attempt) throw new DomainError("UNAVAILABLE", "Course attempt is unavailable.");
    const { participant } = await loadAuthorizedParticipant(tx, context, attempt.id);
    if (participant.selectionSource !== "learner") {
      throw new AuthorizationError("learner's own lesson completion");
    }

    const owningOrganizationId = await loadCoursePublisherOrganizationId(tx, attempt.courseVersionId);
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.lesson.complete",
      eventType: "InstructionalLessonCompleted",
      entityKind: "learner_course_attempt",
      entityId: attempt.id,
      owningOrganizationId,
      payload: input,
    }, async () => {
      const [selection] = await tx.select().from(learnerTrackSelections)
        .where(and(
          eq(learnerTrackSelections.courseAttemptId, attempt.id),
          isNull(learnerTrackSelections.supersededAt),
        ))
        .limit(1);
      if (!selection || selection.revision !== input.expectedRevision) {
        conflict("Recorded teacher selection changed. Reload the lesson before completing it.");
      }
      const eligible = await assertTrackAvailable(
        tx, attempt, selection.trackVersionId, participant.selectionSource,
        "delivery", selection.selectedAt,
      );
      if (selection.policyVersionId !== eligible.policy.id) {
        conflict("The instructional policy changed after track selection.");
      }
      const [lesson] = await tx.select({ id: courseLessons.id }).from(courseLessons)
        .where(and(
          eq(courseLessons.id, input.lessonId),
          eq(courseLessons.courseVersionId, attempt.courseVersionId),
        ))
        .limit(1);
      if (!lesson) throw new DomainError("UNAVAILABLE", "Course lesson is unavailable.");

      // A waived lesson is an official academic decision, not a learner-completion action.
      const [existingProgress] = await tx.select({
        status: learnerLessonProgress.status,
      }).from(learnerLessonProgress).where(and(
        eq(learnerLessonProgress.courseAttemptId, attempt.id),
        eq(learnerLessonProgress.lessonId, lesson.id),
      )).limit(1);
      if (existingProgress?.status === "waived") {
        throw new DomainError("FORBIDDEN", "A waived lesson cannot be marked complete.");
      }
      if (existingProgress?.status === "completed") {
        return {
          courseAttemptId: attempt.id,
          courseVersionId: attempt.courseVersionId,
          lessonId: lesson.id,
          status: "completed",
        };
      }

      const observedAt = new Date();
      await tx.insert(learnerLessonProgress).values({
        courseAttemptId: attempt.id,
        courseVersionId: attempt.courseVersionId,
        lessonId: lesson.id,
        status: "completed",
        observedAt,
      }).onConflictDoUpdate({
        target: [learnerLessonProgress.courseAttemptId, learnerLessonProgress.lessonId],
        set: { status: "completed", observedAt },
      });
      return {
        courseAttemptId: attempt.id,
        courseVersionId: attempt.courseVersionId,
        lessonId: lesson.id,
        status: "completed",
      };
    });
  });
}

export async function recordFormativePractice(
  context: AccessContext,
  raw: z.input<typeof recordFormativePracticeSchema>,
): Promise<JsonObject> {
  assertAuthenticated(context, "learner");
  const input = recordFormativePracticeSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(learnerCourseAttempts)
      .where(eq(learnerCourseAttempts.id, input.courseAttemptId))
      .for("update")
      .limit(1);
    if (!attempt) throw new DomainError("UNAVAILABLE", "Course attempt is unavailable.");
    const { participant } = await loadAuthorizedParticipant(tx, context, attempt.id);
    if (participant.selectionSource !== "learner") {
      throw new AuthorizationError("learner's own formative practice");
    }
    const owningOrganizationId = await loadCoursePublisherOrganizationId(tx, attempt.courseVersionId);
    return runInstructionalTrackCommand(tx, context, {
      requestId: input.requestId,
      action: "instructional.practice.record",
      eventType: "InstructionalPracticeRecorded",
      entityKind: "learner_course_attempt",
      entityId: attempt.id,
      owningOrganizationId,
      payload: input,
    }, async () => {
      const [selection] = await tx.select().from(learnerTrackSelections)
        .where(and(
          eq(learnerTrackSelections.courseAttemptId, attempt.id),
          isNull(learnerTrackSelections.supersededAt),
        ))
        .for("update")
        .limit(1);
      if (!selection) throw new DomainError("UNAVAILABLE", "Select an instructional track before practice.");
      assertCurrentPracticeSelection({
        expectedRevision: input.expectedRevision,
        currentRevision: selection.revision,
        currentTrackVersionId: selection.trackVersionId,
        submittedTrackVersionId: input.trackVersionId,
        currentCourseVersionId: attempt.courseVersionId,
        submittedCourseVersionId: input.courseVersionId,
      });
      const eligible = await assertTrackAvailable(
        tx,
        attempt,
        selection.trackVersionId,
        participant.selectionSource,
        "practice",
        selection.selectedAt,
      );
      if (selection.policyVersionId !== eligible.policy.id) {
        conflict("The instructional policy changed after track selection.");
      }
      const material = eligible.materials.find((item) =>
        item.id === input.materialId &&
        item.courseUnitId &&
        item.materialKind === "practice",
      );
      if (!material) throw new DomainError("UNAVAILABLE", "Practice activity is unavailable for this track.");
      const definition = parseStudentPracticeDefinition(material.activitySpec);
      if (!recordedPracticeResponsesComplete(definition.prompts, input.responses)) {
        invalid("Answer every published practice prompt before saving.");
      }
      const [practiceAttempt] = await tx.insert(formativePracticeAttempts).values({
        courseAttemptId: attempt.id,
        courseVersionId: attempt.courseVersionId,
        trackVersionId: selection.trackVersionId,
        policyVersionId: selection.policyVersionId,
        courseUnitId: material.courseUnitId,
        scoreNumeric: null,
      }).returning({ id: formativePracticeAttempts.id });
      if (!practiceAttempt) {
        throw new DomainError("UNEXPECTED", "Formative practice attempt was not saved.");
      }
      await tx.insert(formativePracticeResponses).values({
        practiceAttemptId: practiceAttempt.id,
        response: { responses: snapshotRecordedPracticeAnswers(definition.prompts, input.responses) },
      });
      return {
        practiceAttemptId: practiceAttempt.id,
        courseAttemptId: attempt.id,
        trackVersionId: selection.trackVersionId,
        policyVersionId: selection.policyVersionId,
        courseUnitId: material.courseUnitId,
      };
    });
  });
}

export async function readFormativePracticeHistory(
  context: AccessContext,
  raw: z.input<typeof readInstructionalTrackSchema>,
): Promise<Array<{
  id: string;
  courseUnitId: string;
  trackVersionId: string | null;
  policyVersionId: string | null;
  scoreNumeric: string | null;
  recordedAt: Date;
  trackTitle: string | null;
  courseUnitTitle: string | null;
  answers: RecordedPracticeAnswer[];
}>> {
  assertAuthenticated(context, "learner_or_guardian");
  const input = readInstructionalTrackSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { attempt, participant } = await loadAuthorizedParticipant(
      tx,
      context,
      input.courseAttemptId,
      true,
    );
    const rows = await tx.select({
      id: formativePracticeAttempts.id,
      courseUnitId: formativePracticeAttempts.courseUnitId,
      trackVersionId: formativePracticeAttempts.trackVersionId,
      policyVersionId: formativePracticeAttempts.policyVersionId,
      scoreNumeric: formativePracticeAttempts.scoreNumeric,
      recordedAt: formativePracticeAttempts.recordedAt,
      trackTitle: instructionalTracks.title,
      courseUnitTitle: courseUnits.title,
    }).from(formativePracticeAttempts)
      .leftJoin(instructionalTrackVersions, eq(
        instructionalTrackVersions.id,
        formativePracticeAttempts.trackVersionId,
      ))
      .leftJoin(instructionalTracks, eq(
        instructionalTracks.id,
        instructionalTrackVersions.instructionalTrackId,
      ))
      .leftJoin(courseUnits, eq(
        courseUnits.id,
        formativePracticeAttempts.courseUnitId,
      ))
      .where(eq(formativePracticeAttempts.courseAttemptId, attempt.id))
      .orderBy(desc(formativePracticeAttempts.recordedAt));

    // Guardians may inspect the history summary; the learner owns private answers.
    if (participant.selectionSource !== "learner" || rows.length === 0) {
      return rows.map(row => ({ ...row, answers: [] as RecordedPracticeAnswer[] }));
    }
    const saved = await tx.select({
      practiceAttemptId: formativePracticeResponses.practiceAttemptId,
      response: formativePracticeResponses.response,
    }).from(formativePracticeResponses).where(and(
      inArray(formativePracticeResponses.practiceAttemptId, rows.map(row => row.id)),
      or(
        isNull(formativePracticeResponses.retainedUntil),
        gt(formativePracticeResponses.retainedUntil, new Date()),
      ),
    ));
    const responseSchema = z.object({
      responses: z.array(z.object({
        promptKey: z.string(),
        promptText: z.string().optional(),
        response: z.string(),
      })),
    });
    const answersByAttempt = new Map<string, RecordedPracticeAnswer[]>();
    for (const entry of saved) {
      const parsed = responseSchema.safeParse(entry.response);
      if (!parsed.success) continue;
      answersByAttempt.set(entry.practiceAttemptId, parsed.data.responses.map(answer => ({
        promptKey: answer.promptKey,
        promptText: answer.promptText ?? answer.promptKey,
        response: answer.response,
      })));
    }
    return rows.map(row => ({ ...row, answers: answersByAttempt.get(row.id) ?? [] }));
  });
}
