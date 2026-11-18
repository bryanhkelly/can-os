import {index,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {educationV30} from "./core";
const id=()=>uuid("id").defaultRandom().primaryKey();

/** Issued to a verified native Person, not an Enrollment or reserved seat. */
export const canonicalClassEnrollmentInvitations=pgTable(
  "class_enrollment_invitations",{
    id:id(),classId:uuid("class_id").notNull(),
    classOfferingVersionId:uuid("class_offering_version_id").notNull(),
    operatingOrganizationId:uuid("operating_organization_id").notNull(),
    siteId:uuid("site_id").notNull(),
    learnerPersonId:uuid("learner_person_id").notNull(),
    invitedByPersonId:uuid("invited_by_person_id").notNull(),
    requestId:uuid("request_id").notNull(),
    creditMode:text("credit_mode").$type<"for_credit"|"audit"|"not_applicable">().notNull(),
    state:text("state").$type<"pending"|"accepted"|"declined"|"revoked"|"expired">().notNull().default("pending"),
    invitedAt:timestamp("invited_at",{withTimezone:true}).notNull().defaultNow(),
    expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
    respondedAt:timestamp("responded_at",{withTimezone:true}),
    acceptedEnrollmentId:uuid("accepted_enrollment_id"),
  },t=>[
    uniqueIndex("ws2_invite_request_idempotency").on(t.classId,t.invitedByPersonId,t.requestId),
    index("ws2_invitation_person_queue").on(t.learnerPersonId,t.state,t.expiresAt),
    index("ws2_invitation_operator_queue").on(t.operatingOrganizationId,t.siteId,t.state,t.expiresAt),
  ]);

/** Review intent. A pending request never establishes guardian consent. */
export const canonicalClassEnrollmentApprovalRequests=pgTable(
  "class_enrollment_approval_requests",{
    id:id(),classId:uuid("class_id").notNull(),
    classOfferingVersionId:uuid("class_offering_version_id").notNull(),
    operatingOrganizationId:uuid("operating_organization_id").notNull(),
    siteId:uuid("site_id").notNull(),
    learnerPersonId:uuid("learner_person_id").notNull(),
    applicantPersonId:uuid("applicant_person_id").notNull(),
    guardianPersonId:uuid("guardian_person_id"),
    guardianAuthorityEvidenceVersionId:uuid("guardian_authority_evidence_version_id"),
    eligibilityEvidenceVersionId:uuid("eligibility_evidence_version_id"),
    requestId:uuid("request_id").notNull(),
    state:text("state").$type<"pending"|"approved"|"rejected"|"withdrawn"|"expired">().notNull().default("pending"),
    requestedAt:timestamp("requested_at",{withTimezone:true}).notNull().defaultNow(),
    expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
    reviewedByPersonId:uuid("reviewed_by_person_id"),
    reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
    decisionReason:text("decision_reason"),
    acceptedEnrollmentId:uuid("accepted_enrollment_id"),
  },t=>[
    uniqueIndex("ws2_approval_request_idempotency").on(t.classId,t.applicantPersonId,t.requestId),
    index("ws2_approval_operator_queue").on(t.operatingOrganizationId,t.siteId,t.state,t.requestedAt),
  ]);

/** A transfer must end the source and create a new destination Enrollment. */
export const canonicalClassEnrollmentTransferRequests=pgTable(
  "class_enrollment_transfer_requests",{
    id:id(),sourceEnrollmentId:uuid("source_enrollment_id").notNull(),
    targetClassId:uuid("target_class_id").notNull(),
    targetOfferingVersionId:uuid("target_offering_version_id").notNull(),
    learnerPersonId:uuid("learner_person_id").notNull(),
    requestedByPersonId:uuid("requested_by_person_id").notNull(),
    requestId:uuid("request_id").notNull(),
    state:text("state").$type<"pending"|"approved"|"rejected"|"cancelled"|"expired">().notNull().default("pending"),
    requestedAt:timestamp("requested_at",{withTimezone:true}).notNull().defaultNow(),
    expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
    approvedByPersonId:uuid("approved_by_person_id"),
    decidedAt:timestamp("decided_at",{withTimezone:true}),
    updatedConsentVersion:text("updated_consent_version"),
    updatedConsentSha256:text("updated_consent_sha256"),
    sourceClosedAt:timestamp("source_closed_at",{withTimezone:true}),
    destinationEnrollmentId:uuid("destination_enrollment_id"),
  },t=>[
    uniqueIndex("ws2_transfer_request_idempotency").on(t.sourceEnrollmentId,t.requestId),
    index("ws2_transfer_destination_idx").on(t.targetClassId,t.state,t.requestedAt),
  ]);

/** Independent permission for a new Attempt after an official completed Class. */
export const canonicalClassEnrollmentRepeatAuthorizations=pgTable(
  "class_enrollment_repeat_authorizations",{
    id:id(),classId:uuid("class_id").notNull(),
    learnerPersonId:uuid("learner_person_id").notNull(),
    priorEnrollmentId:uuid("prior_enrollment_id").notNull(),
    completionOutcomeId:uuid("completion_outcome_id").notNull(),
    evidenceVersionId:uuid("evidence_version_id").notNull(),
    approvedByPersonId:uuid("approved_by_person_id").notNull(),
    approvedAt:timestamp("approved_at",{withTimezone:true}).notNull().defaultNow(),
    expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
    consumedByEnrollmentId:uuid("consumed_by_enrollment_id"),
  },t=>[
    uniqueIndex("ws2_repeat_exact_approval").on(t.classId,t.learnerPersonId,t.priorEnrollmentId,t.completionOutcomeId),
  ]);
