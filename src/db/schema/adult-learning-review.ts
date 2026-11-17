import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accessAccounts } from "./access";
import { people } from "./identity";

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
  organizationId: uuid("organization_id").notNull(),
  verifiedBirthDate: date("verified_birth_date").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  reviewedByAccountId: uuid("reviewed_by_account_id").notNull()
    .references(()=>accessAccounts.id,{onDelete:"restrict"}),
  reviewedAt: timestamp("reviewed_at",{withTimezone:true}).notNull().defaultNow(),
  status: text("status").$type<"approved"|"revoked">().notNull(),
  consumedAt: timestamp("consumed_at",{withTimezone:true}),
  canonicalAccountId: uuid("canonical_account_id"),
  canonicalPersonId: uuid("canonical_person_id"),
},t=>[
  index("adult_learning_review_state_idx").on(t.status,t.reviewedAt),
  uniqueIndex("adult_learning_review_account_uq").on(t.accessAccountId),
]);
