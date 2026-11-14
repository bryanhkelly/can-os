import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  catalogSites,
  domainEvents,
  geographicAreas,
  offeringVersions,
  offerings,
  qualificationApplications,
  qualificationProgramFitAssessments,
  qualificationProgramFitPolicies,
  qualificationProgramFitPolicyVersions,
  qualificationSubjects,
  siteOrganizationRoles,
} from "@/db/canonical-v301";
import {
  createProgramFitAssessmentInputSchema,
  programFitInputSchema,
  programPolicyEvaluationRowSchema,
} from "@/domain/program-fit";
import {
  assertCapability,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { DomainError } from "@/domain/errors";

const policyEvaluationRowsSchema = z.array(programPolicyEvaluationRowSchema).length(1);
type Reader = Pick<typeof db, "select">;

async function assertSiteOperatorRelationship(
  reader: Reader,
  siteId: string,
  organizationId: string,
): Promise<void> {
  const now = new Date();
  const [role] = await reader.select({ id: siteOrganizationRoles.id })
    .from(siteOrganizationRoles)
    .where(and(
      eq(siteOrganizationRoles.siteId, siteId),
      eq(siteOrganizationRoles.organizationId, organizationId),
      eq(siteOrganizationRoles.roleCode, "operator"),
      sql`${siteOrganizationRoles.validFrom} <= ${now}`,
      or(isNull(siteOrganizationRoles.validThrough), gt(siteOrganizationRoles.validThrough, now)),
    ))
    .limit(1);
  if (!role) throw new AuthorizationError("current Site operator relationship");
}

type ProgramFitAssessmentResult = {
  assessmentId: string;
  created: boolean;
};

function isSameAssessment(
  existing: typeof qualificationProgramFitAssessments.$inferSelect,
  input: ReturnType<typeof createProgramFitAssessmentInputSchema.parse>,
  subjectId: string,
  actorPersonId: string,
  geographicAreaId: string | null,
): boolean {
  return existing.subjectId === subjectId
    && existing.baseApplicationId === input.applicationId
    && existing.policyVersionId === input.policyVersionId
    && existing.deploymentId === null
    && existing.geographicAreaId === geographicAreaId
    && existing.participantPopulation === input.participantPopulation
    && existing.populationEvidenceVersionId === (input.populationEvidenceVersionId ?? null)
    && existing.deliveryContext === input.deliveryContext
    && existing.expectedConcurrentLearners === (input.expectedConcurrentLearners ?? null)
    && existing.createdByPersonId === actorPersonId;
}

export async function createProgramFitAssessment(
  context: CommandContext,
  rawInput: unknown,
): Promise<ProgramFitAssessmentResult> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  const actorPersonId = context.actorPersonId;
  assertCapability(context, "program.launch.start");
  const input = createProgramFitAssessmentInputSchema.parse(rawInput);
  if (!context.scope.siteIds?.includes(input.siteId)) {
    throw new AuthorizationError("site scope");
  }

  return db.transaction(async (tx) => {
    const [site] = await tx.select({
      geographicAreaId: catalogSites.geographicAreaId,
      status: catalogSites.status,
    }).from(catalogSites)
      .where(eq(catalogSites.id, input.siteId))
      .limit(1);
    if (!site || site.status === "closed") {
      throw new DomainError("UNAVAILABLE", "The selected Site is unavailable for program-fit assessment.");
    }

    const [existing] = await tx.select().from(qualificationProgramFitAssessments)
      .where(eq(qualificationProgramFitAssessments.id, input.assessmentId))
      .limit(1)
      .for("update");
    if (existing) {
      const [subject] = await tx.select({
        id: qualificationSubjects.id,
        siteId: qualificationSubjects.siteId,
        applicantOrganizationId: qualificationSubjects.applicantOrganizationId,
        subjectKind: qualificationSubjects.subjectKind,
      }).from(qualificationSubjects)
        .where(eq(qualificationSubjects.id, existing.subjectId))
        .limit(1);
      if (!subject
        || subject.subjectKind !== "site"
        || subject.siteId !== input.siteId
        || !context.scope.organizationIds?.includes(subject.applicantOrganizationId)
        || !isSameAssessment(existing, input, subject.id, actorPersonId, site.geographicAreaId)) {
        throw new DomainError("CONFLICT", "The assessment identifier is already in use.");
      }
      return { assessmentId: existing.id, created: false };
    }

    const [application] = await tx.select({
      id: qualificationApplications.id,
      applicantOrganizationId: qualificationApplications.applicantOrganizationId,
      subjectId: qualificationApplications.subjectId,
      intendedPopulation: qualificationApplications.intendedPopulation,
      subjectKind: qualificationSubjects.subjectKind,
      subjectSiteId: qualificationSubjects.siteId,
    }).from(qualificationApplications)
      .innerJoin(
        qualificationSubjects,
        eq(qualificationSubjects.id, qualificationApplications.subjectId),
      )
      .where(and(
        eq(qualificationApplications.id, input.applicationId),
        inArray(qualificationApplications.status, ["submitted", "closed"]),
        eq(qualificationSubjects.subjectKind, "site"),
        eq(qualificationSubjects.siteId, input.siteId),
      ))
      .limit(1);
    if (!application
      || !context.scope.organizationIds?.includes(application.applicantOrganizationId)) {
      throw new AuthorizationError("submitted Site qualification application scope");
    }
    await assertSiteOperatorRelationship(tx, input.siteId, application.applicantOrganizationId);

    const [policy] = await tx.select({
      intendedPopulation: qualificationProgramFitPolicyVersions.intendedPopulation,
      deliveryContext: qualificationProgramFitPolicyVersions.deliveryContext,
    }).from(qualificationProgramFitPolicyVersions)
      .innerJoin(
        qualificationProgramFitPolicies,
        eq(qualificationProgramFitPolicies.id, qualificationProgramFitPolicyVersions.policyId),
      )
      .innerJoin(
        offeringVersions,
        eq(offeringVersions.id, qualificationProgramFitPolicyVersions.offeringVersionId),
      )
      .innerJoin(offerings, eq(offerings.id, offeringVersions.offeringId))
      .where(and(
        eq(qualificationProgramFitPolicyVersions.id, input.policyVersionId),
        eq(qualificationProgramFitPolicyVersions.lifecycle, "published"),
        eq(qualificationProgramFitPolicies.status, "active"),
        eq(offeringVersions.lifecycle, "published"),
        eq(offerings.status, "active"),
      ))
      .limit(1);
    if (!policy) {
      throw new DomainError("UNAVAILABLE", "The selected program-fit policy is unavailable.");
    }
    if (policy.deliveryContext && policy.deliveryContext !== input.deliveryContext) {
      throw new DomainError("VALIDATION_FAILED", "Delivery context does not match the published program-fit policy.");
    }
    if (policy.intendedPopulation !== "any"
      && input.participantPopulation !== "unknown"
      && input.participantPopulation !== policy.intendedPopulation) {
      throw new DomainError("VALIDATION_FAILED", "Participant population is outside the published program-fit policy.");
    }
    if (application.intendedPopulation !== "any"
      && policy.intendedPopulation !== "any"
      && application.intendedPopulation !== policy.intendedPopulation
      && !(application.intendedPopulation === "mixed"
        && (policy.intendedPopulation === "adults" || policy.intendedPopulation === "minors"))) {
      throw new DomainError("VALIDATION_FAILED", "The qualification application population is outside the published program-fit policy.");
    }

    const [inserted] = await tx.insert(qualificationProgramFitAssessments)
      .values({
        id: input.assessmentId,
        subjectId: application.subjectId,
        baseApplicationId: application.id,
        policyVersionId: input.policyVersionId,
        participantPopulation: input.participantPopulation,
        deliveryContext: input.deliveryContext,
        createdByPersonId: actorPersonId,
        ...(site.geographicAreaId ? { geographicAreaId: site.geographicAreaId } : {}),
        ...(input.populationEvidenceVersionId
          ? { populationEvidenceVersionId: input.populationEvidenceVersionId }
          : {}),
        ...(input.expectedConcurrentLearners !== undefined
          ? { expectedConcurrentLearners: input.expectedConcurrentLearners }
          : {}),
      })
      .onConflictDoNothing({ target: qualificationProgramFitAssessments.id })
      .returning();

    if (!inserted) {
      const [raced] = await tx.select().from(qualificationProgramFitAssessments)
        .where(eq(qualificationProgramFitAssessments.id, input.assessmentId))
        .limit(1);
      if (raced && isSameAssessment(
        raced,
        input,
        application.subjectId,
        actorPersonId,
        site.geographicAreaId,
      )) {
        return { assessmentId: raced.id, created: false };
      }
      throw new DomainError("CONFLICT", "The assessment identifier was concurrently used.");
    }

    await tx.insert(auditEvents).values({
      actorPersonId,
      owningOrganizationId: application.applicantOrganizationId,
      eventCode: "program_fit.assessment.created",
      entityKind: "program_fit_assessment",
      entityId: inserted.id,
      payload: {
        applicationId: application.id,
        policyVersionId: input.policyVersionId,
        siteId: input.siteId,
        requestId: context.requestId ?? null,
      },
    });
    await tx.insert(domainEvents).values({
      eventType: "ProgramFitAssessmentCreated",
      aggregateType: "ProgramFitAssessment",
      aggregateId: inserted.id,
      actorPersonId,
      payload: {
        organizationId: application.applicantOrganizationId,
        siteId: input.siteId,
        applicationId: application.id,
        policyVersionId: input.policyVersionId,
      },
    });
    return { assessmentId: inserted.id, created: true };
  });
}

export async function evaluateProgramFit(
  context: CommandContext,
  rawInput: unknown,
) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "program.launch.start");
  const input = programFitInputSchema.parse(rawInput);

  let geographicAreaId: string | null;
  if (input.subject.kind === "site") {
    if (!context.scope.siteIds?.includes(input.subject.siteId)) {
      throw new AuthorizationError("site scope");
    }
    const [site] = await db.select({
      geographicAreaId: catalogSites.geographicAreaId,
      status: catalogSites.status,
    }).from(catalogSites)
      .where(eq(catalogSites.id, input.subject.siteId))
      .limit(1);
    if (!site || site.status === "closed") {
      throw new DomainError("UNAVAILABLE", "The selected Site is unavailable for program-fit evaluation.");
    }
    geographicAreaId = site.geographicAreaId;
  } else {
    if (!context.scope.organizationIds?.length) {
      throw new AuthorizationError("proposing organization scope");
    }
    const [geography] = await db.select({ id: geographicAreas.id })
      .from(geographicAreas)
      .where(eq(geographicAreas.id, input.subject.geographicAreaId))
      .limit(1);
    if (!geography) {
      throw new DomainError("VALIDATION_FAILED", "The proposed location is not in a recognized geographic area.");
    }
    geographicAreaId = geography.id;
  }

  if (input.assessmentId) {
    if (input.subject.kind !== "site") {
      throw new AuthorizationError("program-fit assessment Site scope");
    }
    const [assessmentScope] = await db.select({
      siteId: qualificationSubjects.siteId,
      applicantOrganizationId: qualificationSubjects.applicantOrganizationId,
      subjectKind: qualificationSubjects.subjectKind,
    }).from(qualificationProgramFitAssessments)
      .innerJoin(
        qualificationSubjects,
        eq(qualificationSubjects.id, qualificationProgramFitAssessments.subjectId),
      )
      .where(eq(qualificationProgramFitAssessments.id, input.assessmentId))
      .limit(1);
    if (!assessmentScope
      || assessmentScope.subjectKind !== "site"
      || assessmentScope.siteId !== input.subject.siteId) {
      throw new AuthorizationError("program-fit assessment Site scope");
    }
    if (!context.scope.organizationIds?.includes(assessmentScope.applicantOrganizationId)) {
      throw new AuthorizationError("program-fit assessment organization scope");
    }
    await assertSiteOperatorRelationship(
      db,
      input.subject.siteId,
      assessmentScope.applicantOrganizationId,
    );
  }

  const result = await db.execute(sql`
    SELECT policy_version_id AS "policyVersionId",
      offering_version_id AS "offeringVersionId",
      catalog_status AS "catalogStatus",
      provider_support AS "providerSupport",
      regulatory_status AS "regulatoryStatus",
      qualification_status AS "qualificationStatus",
      fit_recommendation AS "fitRecommendation",
      reviewed_fit_outcome AS "reviewedFitOutcome",
      stage_authorization_decision AS "stageAuthorizationDecision",
      readiness_outcome AS "readinessOutcome",
      required_action_items AS "requiredActionItems",
      activation_eligible AS "activationEligible"
    FROM education_v30.v301_policy_evaluation(
      ${input.policyVersionId}::uuid,
      ${geographicAreaId}::uuid,
      ${input.deliveryContext}::text,
      ${input.assessmentId ?? null}::uuid,
      ${input.stage}::text
    )
  `);
  const evaluations = policyEvaluationRowsSchema.parse(result.rows);
  const evaluation = evaluations[0];
  if (!evaluation) {
    throw new DomainError("UNAVAILABLE", "The canonical program-fit evaluation returned no result.");
  }
  if (evaluation.policyVersionId !== input.policyVersionId
    || evaluation.offeringVersionId !== input.offeringVersionId) {
    throw new DomainError(
      "UNAVAILABLE",
      "The selected Offering does not match an active published program-fit policy.",
    );
  }
  return evaluation;
}
