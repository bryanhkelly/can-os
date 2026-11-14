import {
  bigint,
  jsonb,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { educationV30, educationV30Secure, type JsonObject } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();

export const operationalAuthorizationDecisions = educationV30.table(
  "operational_authorization_decisions",
  {
    id: id(),
    stageCode: text("stage_code")
      .$type<
        | "design"
        | "market_proposed"
        | "publish_approved"
        | "accept_inquiries"
        | "accept_applications"
        | "enroll"
        | "register_noncredit"
        | "deliver"
        | "operate"
        | "issue_credit"
        | "issue_credential"
      >()
      .notNull(),
    operationId: uuid("operation_id"),
    deploymentId: uuid("deployment_id"),
    siteId: uuid("site_id"),
    offeringVersionId: uuid("offering_version_id"),
    authorityOrganizationId: uuid("authority_organization_id").notNull(),
    authorizingPersonId: uuid("authorizing_person_id").notNull(),
    governancePolicyVersionId: uuid("governance_policy_version_id"),
    decision: text("decision")
      .$type<"approved" | "conditional" | "denied" | "suspended" | "revoked">()
      .notNull(),
    decisionOrder: bigint("decision_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    evidenceVersionId: uuid("evidence_version_id").notNull(),
    supersedesId: uuid("supersedes_id"),
  },
  (table) => [
    uniqueIndex("operational_authorization_decisions_order_uq").on(table.decisionOrder),
    uniqueIndex("operational_authorization_decisions_supersedes_uq").on(table.supersedesId),
  ],
);

export const operationPublicationSnapshots = educationV30.table(
  "operation_publication_snapshots",
  {
    id: id(),
    operationId: uuid("operation_id").notNull(),
    deploymentId: uuid("deployment_id"),
    publicationKind: text("publication_kind")
      .$type<"planned" | "approved" | "enrolling" | "operating">()
      .notNull(),
    claimsSnapshot: jsonb("claims_snapshot").$type<JsonObject>().notNull(),
    sha256: text("sha256").notNull(),
    approvedByPersonId: uuid("approved_by_person_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    sourceConfigurationVersionId: uuid("source_configuration_version_id"),
  },
);

export const publicationWithdrawals = educationV30.table("publication_withdrawals", {
  id: id(),
  publicationSnapshotId: uuid("publication_snapshot_id").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  authorizedByPersonId: uuid("authorized_by_person_id").notNull(),
});

export const programPublicationClaims = educationV30.table("program_publication_claims", {
  id: id(),
  publicationSnapshotId: uuid("publication_snapshot_id").notNull(),
  operationId: uuid("operation_id").notNull(),
  deploymentId: uuid("deployment_id"),
  offeringVersionId: uuid("offering_version_id"),
  programClaimKind: text("program_claim_kind")
    .$type<"proposed" | "approved" | "enrolling" | "operating">()
    .notNull(),
  displayText: text("display_text").notNull(),
  sourceAuthorizationDecisionId: uuid("source_authorization_decision_id").notNull(),
  reviewedByPersonId: uuid("reviewed_by_person_id").notNull(),
});

export const sitePublicationBindings = educationV30.table("site_publication_bindings", {
  siteId: uuid("site_id").primaryKey(),
  publicSlug: text("public_slug").notNull().unique(),
  status: text("status").$type<"draft" | "published">().notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const enrollmentProspects = educationV30.table("enrollment_prospects", {
  id: id(),
  owningOrganizationId: uuid("owning_organization_id").notNull(),
  contactPersonId: uuid("contact_person_id"),
  prospectKind: text("prospect_kind")
    .$type<"self" | "guardian" | "family" | "employer" | "organization">()
    .notNull(),
  firstContactAt: timestamp("first_contact_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status")
    .$type<"new" | "contacted" | "applied" | "converted" | "closed">()
    .notNull()
    .default("new"),
  consentRecordId: uuid("consent_record_id"),
  notesClassification: text("notes_classification")
    .$type<"restricted" | "confidential">()
    .notNull()
    .default("restricted"),
});

export const enrollmentProspectContactDetails = educationV30Secure.table(
  "enrollment_prospect_contact_details",
  {
    prospectId: uuid("prospect_id")
      .primaryKey()
      .references(() => enrollmentProspects.id),
    requestId: uuid("request_id").notNull().unique(),
    contactFirstName: text("contact_first_name").notNull(),
    contactLastName: text("contact_last_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    emailDigest: text("email_digest").notNull(),
    message: text("message").notNull().default(""),
    contactConsentAt: timestamp("contact_consent_at", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const enrollmentProspectInterests = educationV30.table(
  "enrollment_prospect_interests",
  {
    id: id(),
    prospectId: uuid("prospect_id").notNull(),
    deploymentId: uuid("deployment_id"),
    offeringId: uuid("offering_id"),
    operationId: uuid("operation_id"),
    interestKind: text("interest_kind")
      .$type<"information" | "school_visit" | "application" | "event" | "waitlist">()
      .notNull(),
    indicatedAt: timestamp("indicated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export interface CurrentPublicProgramClaimRow {
  claimId: string;
  operationId: string;
  deploymentId: string | null;
  offeringVersionId: string | null;
  programClaimKind: "proposed" | "approved" | "enrolling" | "operating";
  displayText: string;
  publishedAt: Date;
  publicationSnapshotId: string;
  sourceAuthorizationDecisionId: string;
}

export type OperationalAuthorizationDecisionRow =
  typeof operationalAuthorizationDecisions.$inferSelect;
export type OperationPublicationSnapshotRow =
  typeof operationPublicationSnapshots.$inferSelect;
export type ProgramPublicationClaimRow = typeof programPublicationClaims.$inferSelect;
export type EnrollmentProspectRow = typeof enrollmentProspects.$inferSelect;
export type EnrollmentProspectContactDetailsRow =
  typeof enrollmentProspectContactDetails.$inferSelect;
