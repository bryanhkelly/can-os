import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  domainEvents,
  qualificationApplications,
  qualificationProgramFitAssessments,
  qualificationProgramFitPolicies,
  qualificationProgramFitPolicyVersions,
  qualificationProgramFitReviewerAuthorizations,
  qualificationProgramFitReviewerRevocations,
  qualificationProgramFitReviews,
} from "@/db/canonical-v301";
import { createProgramFitReviewInputSchema } from "@/domain/program-fit-review";
import {
  assertCapability,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { DomainError } from "@/domain/errors";

type ProgramFitReviewResult = {
  assessmentId: string;
  reviewId: string;
  created: boolean;
};

function isSameReview(
  existing: typeof qualificationProgramFitReviews.$inferSelect,
  actorPersonId: string,
  input: ReturnType<typeof createProgramFitReviewInputSchema.parse>,
): boolean {
  return existing.reviewedByPersonId === actorPersonId
    && existing.assessmentId === input.assessmentId
    && existing.reviewOutcome === input.reviewOutcome
    && existing.rationale === input.rationale
    && existing.overrideJustification === (input.overrideJustification ?? null)
    && existing.overrideEvidenceVersionId === (input.overrideEvidenceVersionId ?? null);
}

export async function createProgramFitReview(
  context: CommandContext,
  rawInput: unknown,
): Promise<ProgramFitReviewResult> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "program.fit.review");
  const actorPersonId = context.actorPersonId;
  const input = createProgramFitReviewInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const [assessment] = await tx.select({
      id: qualificationProgramFitAssessments.id,
      policyId: qualificationProgramFitPolicies.id,
      policyOwnerOrganizationId: qualificationProgramFitPolicies.ownerOrganizationId,
      applicantContactPersonId: qualificationApplications.contactPersonId,
    }).from(qualificationProgramFitAssessments)
      .innerJoin(
        qualificationProgramFitPolicyVersions,
        eq(
          qualificationProgramFitPolicyVersions.id,
          qualificationProgramFitAssessments.policyVersionId,
        ),
      )
      .innerJoin(
        qualificationProgramFitPolicies,
        eq(
          qualificationProgramFitPolicies.id,
          qualificationProgramFitPolicyVersions.policyId,
        ),
      )
      .innerJoin(
        qualificationApplications,
        eq(qualificationApplications.id, qualificationProgramFitAssessments.baseApplicationId),
      )
      .where(eq(qualificationProgramFitAssessments.id, input.assessmentId))
      .limit(1);
    if (!assessment) {
      throw new DomainError("UNAVAILABLE", "The program-fit assessment is unavailable.");
    }
    if (!context.scope.organizationIds?.includes(assessment.policyOwnerOrganizationId)) {
      throw new AuthorizationError("program-fit policy owner organization scope");
    }
    if (assessment.applicantContactPersonId === actorPersonId) {
      throw new AuthorizationError("independent program-fit reviewer");
    }

    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`program-fit-review:${assessment.id}`}, 0)
      )
    `);

    const now = new Date();
    const authorizations = await tx.select({
      id: qualificationProgramFitReviewerAuthorizations.id,
      permissionCode: qualificationProgramFitReviewerAuthorizations.permissionCode,
    }).from(qualificationProgramFitReviewerAuthorizations)
      .where(and(
        eq(qualificationProgramFitReviewerAuthorizations.policyId, assessment.policyId),
        eq(
          qualificationProgramFitReviewerAuthorizations.authorizingOrganizationId,
          assessment.policyOwnerOrganizationId,
        ),
        eq(qualificationProgramFitReviewerAuthorizations.reviewerPersonId, actorPersonId),
        inArray(qualificationProgramFitReviewerAuthorizations.permissionCode, [
          "evaluate_fit",
          "override_fit",
        ]),
        lte(qualificationProgramFitReviewerAuthorizations.validFrom, now),
        or(
          isNull(qualificationProgramFitReviewerAuthorizations.validThrough),
          gt(qualificationProgramFitReviewerAuthorizations.validThrough, now),
        ),
      ));
    if (!authorizations.length) {
      throw new AuthorizationError("current program-fit reviewer authorization");
    }
    const revoked = await tx.select({
      authorizationId: qualificationProgramFitReviewerRevocations.authorizationId,
    }).from(qualificationProgramFitReviewerRevocations)
      .where(and(
        inArray(
          qualificationProgramFitReviewerRevocations.authorizationId,
          authorizations.map((authorization) => authorization.id),
        ),
        lte(qualificationProgramFitReviewerRevocations.revokedAt, now),
      ));
    const revokedIds = new Set(revoked.map((row) => row.authorizationId));
    const currentAuthorizations = authorizations.filter(
      (authorization) => !revokedIds.has(authorization.id),
    );
    if (!currentAuthorizations.length) {
      throw new AuthorizationError("current program-fit reviewer authorization");
    }

    const [existing] = await tx.select().from(qualificationProgramFitReviews)
      .where(eq(qualificationProgramFitReviews.id, input.reviewId))
      .limit(1);
    if (existing) {
      if (!isSameReview(existing, actorPersonId, input)) {
        throw new DomainError("CONFLICT", "The review identifier is already in use.");
      }
      return { assessmentId: existing.assessmentId, reviewId: existing.id, created: false };
    }

    const hasOverrideAuthorization = currentAuthorizations.some(
      (authorization) => authorization.permissionCode === "override_fit",
    );
    if (input.overrideJustification && !hasOverrideAuthorization) {
      throw new AuthorizationError("program-fit override reviewer authorization");
    }
    const reviewerAuthorization = currentAuthorizations.find(
      (authorization) => input.overrideJustification
        ? authorization.permissionCode === "override_fit"
        : authorization.permissionCode === "evaluate_fit",
    ) ?? currentAuthorizations.find(
      (authorization) => authorization.permissionCode === "override_fit",
    );
    if (!reviewerAuthorization) {
      throw new AuthorizationError("program-fit reviewer authorization");
    }

    const [latestReview] = await tx.select({
      id: qualificationProgramFitReviews.id,
    }).from(qualificationProgramFitReviews)
      .where(eq(qualificationProgramFitReviews.assessmentId, assessment.id))
      .orderBy(desc(qualificationProgramFitReviews.reviewOrder))
      .limit(1)
      .for("update");

    const [review] = await tx.insert(qualificationProgramFitReviews).values({
      id: input.reviewId,
      assessmentId: assessment.id,
      reviewerAuthorizationId: reviewerAuthorization.id,
      reviewedByPersonId: actorPersonId,
      reviewOutcome: input.reviewOutcome,
      rationale: input.rationale,
      overrideJustification: input.overrideJustification ?? null,
      overrideEvidenceVersionId: input.overrideEvidenceVersionId ?? null,
      reviewedAt: now,
      supersedesId: latestReview?.id ?? null,
    }).returning({ id: qualificationProgramFitReviews.id });
    if (!review) throw new Error("Program-fit review was not created.");

    await tx.insert(auditEvents).values({
      actorPersonId,
      owningOrganizationId: assessment.policyOwnerOrganizationId,
      eventCode: "program_fit.review.created",
      entityKind: "program_fit_review",
      entityId: review.id,
      payload: {
        assessmentId: assessment.id,
        reviewOutcome: input.reviewOutcome,
        supersedesId: latestReview?.id ?? null,
        requestId: context.requestId ?? null,
      },
    });
    await tx.insert(domainEvents).values({
      eventType: "ProgramFitReviewCreated",
      aggregateType: "ProgramFitAssessment",
      aggregateId: assessment.id,
      actorPersonId,
      payload: {
        organizationId: assessment.policyOwnerOrganizationId,
        reviewId: review.id,
        reviewOutcome: input.reviewOutcome,
        supersedesId: latestReview?.id ?? null,
      },
    });
    return { assessmentId: assessment.id, reviewId: review.id, created: true };
  });
}
