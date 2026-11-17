import { date, index, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accessAccounts } from "./access";
import { people } from "./identity";
import { canonicalAccounts, canonicalPersons, canonicalEnrollmentOrganizations } from "@/db/canonical-v301";

/**
 * Independently reviewed adult evidence, not a self-declared date of birth.
 * Only a trusted operational review may insert an approved record.
 * The learner-facing activation path can only consume an approved exact pair.
 */
export const accessAdultLearningReviews = pgTable("access_adult_learning_reviews", {
  accessAccountId: uuid("access_account_id").primaryKey()
    .references(()=>accessAccounts.id,{onDelete:"restrict"}),
  accessPersonId: uuid("access_person_id").notNull()
    .references(()=>people.id,{onDelete:"restrict"}),
  organizationId: uuid("organization_id").notNull()
    .references(()=>canonicalEnrollmentOrganizations.id,{onDelete:"restrict"}),
  verifiedBirthDate: date("verified_birth_date").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  reviewedByAccountId: uuid("reviewed_by_account_id").notNull()
    .references(()=>accessAccounts.id,{onDelete:"restrict"}),
  reviewedAt: timestamp("reviewed_at",{withTimezone:true}).notNull().defaultNow(),
  status: text("status").$type<"approved"|"revoked">().notNull(),
  consumedAt: timestamp("consumed_at",{withTimezone:true}),
  canonicalAccountId: uuid("canonical_account_id").unique()
    .references(()=>canonicalAccounts.id,{onDelete:"restrict"}),
  canonicalPersonId: uuid("canonical_person_id").unique()
    .references(()=>canonicalPersons.id,{onDelete:"restrict"}),
},t=>[
  index("adult_learning_review_state_idx").on(t.status,t.reviewedAt),
  check("adult_learning_independent_reviewer",sql`${t.accessAccountId} <> ${t.reviewedByAccountId}`),
  check("adult_learning_consumption_pair",sql`(
    (${t.consumedAt} IS NULL AND ${t.canonicalAccountId} IS NULL AND ${t.canonicalPersonId} IS NULL)
    OR (${t.consumedAt} IS NOT NULL AND ${t.canonicalAccountId} IS NOT NULL AND ${t.canonicalPersonId} IS NOT NULL)
  )`),
  check("access_adult_learning_reviews_evidence_reference_check",sql`length(${t.evidenceReference}) BETWEEN 8 AND 256`),
  check("access_adult_learning_reviews_status_check",sql`${t.status} IN ('approved','revoked')`),
]);
