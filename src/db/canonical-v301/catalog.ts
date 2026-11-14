import {
  bigint,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { educationV30 } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();

export const qualificationProgramFitPolicies = educationV30.table(
  "qualification_program_fit_policies",
  {
    id: id(),
    ownerOrganizationId: uuid("owner_organization_id").notNull(),
    policyCode: text("policy_code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("qualification_program_fit_policies_owner_code_uq").on(
      table.ownerOrganizationId,
      table.policyCode,
    ),
    uniqueIndex("qualification_program_fit_policies_id_owner_uq").on(
      table.id,
      table.ownerOrganizationId,
    ),
  ],
);

export const geographicAreas = educationV30.table("geographic_areas", {
  id: id(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  levelCode: text("level_code").notNull(),
  parentId: uuid("parent_id"),
});

export const catalogSites = educationV30.table("sites", {
  id: id(),
  geographicAreaId: uuid("geographic_area_id"),
  status: text("status").$type<"planning" | "active" | "closed">().notNull(),
});

export const siteOrganizationRoles = educationV30.table("site_organization_roles", {
  id: id(),
  siteId: uuid("site_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  roleCode: text("role_code").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validThrough: timestamp("valid_through", { withTimezone: true }),
});

export const educationOperations = educationV30.table("education_operations", {
  id: id(),
  name: text("name").notNull(),
  status: text("status").$type<"planning" | "active" | "paused" | "closed">().notNull(),
});

export const educationOperationSites = educationV30.table("education_operation_sites", {
  id: id(),
  operationId: uuid("operation_id").notNull(),
  siteId: uuid("site_id").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validThrough: timestamp("valid_through", { withTimezone: true }),
});

export const qualificationApplications = educationV30.table("qualification_applications", {
  id: id(),
  applicantOrganizationId: uuid("applicant_organization_id").notNull(),
  subjectId: uuid("subject_id").notNull(),
  contactPersonId: uuid("contact_person_id").notNull(),
  status: text("status").$type<"draft" | "submitted" | "withdrawn" | "closed">().notNull(),
  intendedPopulation: text("intended_population")
    .$type<"any" | "adults" | "minors" | "mixed">()
    .notNull(),
});

export const qualificationProgramFitPolicyVersions = educationV30.table(
  "qualification_program_fit_policy_versions",
  {
    id: id(),
    policyId: uuid("policy_id").notNull(),
    versionNo: integer("version_no").notNull(),
    supersedesId: uuid("supersedes_id"),
    blueprintComponentId: uuid("blueprint_component_id"),
    offeringVersionId: uuid("offering_version_id"),
    intendedPopulation: text("intended_population")
      .$type<"any" | "adults" | "minors" | "mixed">()
      .notNull()
      .default("any"),
    deliveryContext: text("delivery_context").$type<"remote" | "onsite" | "hybrid">(),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("qualification_program_fit_policy_versions_policy_version_uq").on(
      table.policyId,
      table.versionNo,
    ),
    uniqueIndex("qualification_program_fit_policy_versions_id_policy_uq").on(
      table.id,
      table.policyId,
    ),
  ],
);

export const qualificationProgramFitPolicyWithdrawals = educationV30.table(
  "qualification_program_fit_policy_version_withdrawals",
  {
    policyVersionId: uuid("policy_version_id").primaryKey(),
    withdrawnByPersonId: uuid("withdrawn_by_person_id").notNull(),
    reason: text("reason").notNull(),
    evidenceVersionId: uuid("evidence_version_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const qualificationProgramFitPolicyRequirements = educationV30.table(
  "qualification_program_fit_policy_requirements",
  {
    id: id(),
    policyVersionId: uuid("policy_version_id").notNull(),
    requirementCode: text("requirement_code").notNull(),
    title: text("title").notNull(),
    sourceKind: text("source_kind")
      .$type<"qualification_requirement" | "site_capability" | "program_criterion">()
      .notNull(),
    qualificationRequirementId: uuid("qualification_requirement_id"),
    facilityCapabilityCode: text("facility_capability_code"),
    criterionText: text("criterion_text"),
    importance: text("importance").$type<"blocking" | "required" | "advisory">().notNull().default("required"),
    evidenceStandard: text("evidence_standard")
      .$type<"self_report" | "document_review" | "independent_verification">()
      .notNull()
      .default("self_report"),
    audience: text("audience").$type<"any" | "adults" | "minors">().notNull().default("any"),
    resourceKind: text("resource_kind"),
    minimumQuantity: numeric("minimum_quantity", { precision: 14, scale: 3 }),
    remediationGuidance: text("remediation_guidance"),
  },
  (table) => [
    uniqueIndex("qualification_fit_requirements_version_code_uq").on(
      table.policyVersionId,
      table.requirementCode,
    ),
    uniqueIndex("qualification_fit_requirements_id_version_uq").on(
      table.id,
      table.policyVersionId,
    ),
  ],
);

export const qualificationProgramAvailabilityRules = educationV30.table(
  "qualification_program_availability_rules",
  {
    id: id(),
    policyVersionId: uuid("policy_version_id").notNull(),
    geographicAreaId: uuid("geographic_area_id"),
    availabilityBasis: text("availability_basis")
      .$type<"provider_support" | "regulatory">()
      .notNull()
      .default("regulatory"),
    deliveryContext: text("delivery_context").$type<"remote" | "onsite" | "hybrid">(),
    availability: text("availability")
      .$type<"possible" | "conditional" | "unavailable" | "requires_research">()
      .notNull(),
    reasoning: text("reasoning").notNull(),
    sourceEvidenceVersionId: uuid("source_evidence_version_id").notNull(),
    reviewedByPersonId: uuid("reviewed_by_person_id").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
  },
);

export const qualificationProgramFitAssessments = educationV30.table(
  "qualification_program_fit_assessments",
  {
    id: id(),
    subjectId: uuid("subject_id").notNull(),
    baseApplicationId: uuid("base_application_id").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    deploymentId: uuid("deployment_id"),
    geographicAreaId: uuid("geographic_area_id"),
    participantPopulation: text("participant_population")
      .$type<"unknown" | "adults" | "minors" | "mixed">()
      .notNull()
      .default("unknown"),
    populationEvidenceVersionId: uuid("population_evidence_version_id"),
    deliveryContext: text("delivery_context")
      .$type<"remote" | "onsite" | "hybrid">()
      .notNull(),
    expectedConcurrentLearners: integer("expected_concurrent_learners"),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("qualification_program_fit_assessments_id_policy_uq").on(
      table.id,
      table.policyVersionId,
    ),
    uniqueIndex("qualification_program_fit_assessments_id_subject_uq").on(
      table.id,
      table.subjectId,
    ),
  ],
);

export const qualificationSubjects = educationV30.table("qualification_subjects", {
  id: id(),
  applicantOrganizationId: uuid("applicant_organization_id").notNull(),
  subjectKind: text("subject_kind")
    .$type<
      | "organization"
      | "proposed_site"
      | "site"
      | "operation"
      | "deployment"
      | "person"
      | "equipment_asset"
      | "funding_application"
    >()
    .notNull(),
  siteId: uuid("site_id"),
});

export const qualificationProgramFitRequirementResults = educationV30.table(
  "qualification_program_fit_requirement_results",
  {
    id: id(),
    assessmentId: uuid("assessment_id").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    policyRequirementId: uuid("policy_requirement_id").notNull(),
    determination: text("determination")
      .$type<"satisfied" | "deficient" | "pending" | "not_applicable">()
      .notNull(),
    verificationLevel: text("verification_level").$type<"reported" | "verified">().notNull(),
    sourceQualificationEvaluationId: uuid("source_qualification_evaluation_id"),
    sourceFacilityVerificationId: uuid("source_facility_verification_id"),
    sourceEvidenceVersionId: uuid("source_evidence_version_id"),
    evaluatedByPersonId: uuid("evaluated_by_person_id").notNull(),
    rationale: text("rationale").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid("supersedes_id"),
    resultOrder: bigint("result_order", { mode: "bigint" }).notNull(),
  },
  (table) => [
    uniqueIndex("qualification_fit_results_result_order_uq").on(table.resultOrder),
    uniqueIndex("qualification_fit_results_supersedes_uq").on(table.supersedesId),
    uniqueIndex("qualification_fit_results_initial_uq")
      .on(table.assessmentId, table.policyRequirementId)
      .where(isNull(table.supersedesId)),
    uniqueIndex("qualification_fit_results_id_assessment_requirement_uq").on(
      table.id,
      table.assessmentId,
      table.policyRequirementId,
    ),
  ],
);

export const qualificationProgramFitReviewerAuthorizations = educationV30.table(
  "qualification_program_fit_reviewer_authorizations",
  {
    id: id(),
    policyId: uuid("policy_id").notNull(),
    authorizingOrganizationId: uuid("authorizing_organization_id").notNull(),
    reviewerPersonId: uuid("reviewer_person_id").notNull(),
    permissionCode: text("permission_code")
      .$type<"evaluate_fit" | "override_fit">()
      .notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    approvedByPersonId: uuid("approved_by_person_id").notNull(),
    authorityEvidenceVersionId: uuid("authority_evidence_version_id").notNull(),
  },
);

export const qualificationProgramFitReviewerRevocations = educationV30.table(
  "qualification_program_fit_reviewer_revocations",
  {
    authorizationId: uuid("authorization_id").primaryKey(),
    revokedByPersonId: uuid("revoked_by_person_id").notNull(),
    revocationEvidenceVersionId: uuid("revocation_evidence_version_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
  },
);

export const qualificationProgramFitReviews = educationV30.table(
  "qualification_program_fit_reviews",
  {
    id: id(),
    assessmentId: uuid("assessment_id").notNull(),
    reviewerAuthorizationId: uuid("reviewer_authorization_id").notNull(),
    reviewedByPersonId: uuid("reviewed_by_person_id").notNull(),
    reviewOutcome: text("review_outcome")
      .$type<ProgramFitRecommendation>()
      .notNull(),
    rationale: text("rationale").notNull(),
    overrideJustification: text("override_justification"),
    overrideEvidenceVersionId: uuid("override_evidence_version_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid("supersedes_id"),
    reviewOrder: bigint("review_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
  },
  (table) => [
    uniqueIndex("qualification_program_fit_reviews_order_uq").on(table.reviewOrder),
    uniqueIndex("qualification_program_fit_reviews_supersedes_uq").on(table.supersedesId),
    uniqueIndex("qualification_program_fit_reviews_root_uq")
      .on(table.assessmentId)
      .where(isNull(table.supersedesId)),
  ],
);

export type CatalogAvailabilityStatus =
  | "supported"
  | "conditional"
  | "unavailable"
  | "review_required";
export type CatalogAvailability = "possible" | "conditional" | "unavailable" | "requires_research";
export type ActivationStage =
  | "accept_applications"
  | "enroll"
  | "register_noncredit"
  | "deliver"
  | "operate";
export type ProgramFitRecommendation =
  | "candidate"
  | "needs_resources"
  | "needs_verification"
  | "not_recommended";

export interface CatalogAvailabilityRow {
  policyVersionId: string;
  providerSupport: CatalogAvailability;
  regulatoryStatus: CatalogAvailability;
  catalogStatus: CatalogAvailabilityStatus;
  explanation: string;
}

export interface ProgramPolicyEvaluationRow {
  policyVersionId: string;
  offeringVersionId: string | null;
  catalogStatus: CatalogAvailabilityStatus;
  providerSupport: CatalogAvailability;
  regulatoryStatus: CatalogAvailability;
  qualificationStatus: "draft" | "submitted" | "withdrawn" | "closed" | "not_started";
  fitRecommendation: ProgramFitRecommendation | "not_assessed";
  reviewedFitOutcome:
    | "candidate"
    | "needs_resources"
    | "needs_verification"
    | "not_recommended"
    | "not_reviewed";
  stageAuthorizationDecision:
    | "approved"
    | "conditional"
    | "denied"
    | "suspended"
    | "revoked"
    | null;
  readinessOutcome: "ready" | "ready_with_conditions" | "not_ready" | "not_required" | null;
  requiredActionItems: Array<{
    requirement_id: string;
    code: string;
    importance: "blocking" | "required";
    status: "satisfied" | "deficient" | "pending" | "not_applicable" | "missing";
    remediation: string | null;
  }>;
  activationEligible: boolean;
}

export type QualificationProgramFitPolicyVersionRow =
  typeof qualificationProgramFitPolicyVersions.$inferSelect;
export type QualificationProgramAvailabilityRuleRow =
  typeof qualificationProgramAvailabilityRules.$inferSelect;
export type QualificationProgramFitAssessmentRow =
  typeof qualificationProgramFitAssessments.$inferSelect;
export type QualificationProgramFitReviewRow =
  typeof qualificationProgramFitReviews.$inferSelect;
