import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";

/**
 * WS3 migration proposal: independently approved immutable evidence-to-subject
 * references, never an outcome, enrollment, assessment or award ledger.
 * SQL patch owns RLS, integrity triggers and application access.
 */
export const learningCompletionEvidenceBindings=educationV30.table(
  "learning_completion_evidence_bindings", {
    id:uuid("id").defaultRandom().primaryKey(),
    purpose:text("purpose")
      .$type<"completion_correction"|"award_revocation">().notNull(),
    evidenceVersionId:uuid("evidence_version_id").notNull(),
    noncreditRegistrationId:uuid("noncredit_registration_id"),
    awardIssuanceId:uuid("award_issuance_id"),
    participantPersonId:uuid("participant_person_id").notNull(),
    providerOrganizationId:uuid("provider_organization_id").notNull(),
    deliverySiteId:uuid("delivery_site_id").notNull(),
    submittedByPersonId:uuid("submitted_by_person_id").notNull(),
    approvedByPersonId:uuid("approved_by_person_id").notNull(),
    approvedAt:timestamp("approved_at",{withTimezone:true}).notNull(),
    createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  },
);
