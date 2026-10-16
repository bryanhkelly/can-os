import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { actions } from "./work";

/**
 * GF41B typed support workflow. The Action row remains the universal work object;
 * these tables hold the referral lifecycle state that previously lived in actions.metadata.
 */
export const supportReferrals = pgTable("support_referrals", {
  id: id(),
  actionId: uuid("action_id").notNull().references(() => actions.id, { onDelete: "cascade" }),
  stage: text("stage").default("submitted").notNull(),
  category: text("category").notNull(),
  requestedArea: text("requested_area"),
  source: text("source").default("teacher").notNull(),
  includeEvidence: boolean("include_evidence").default(false).notNull(),
  notes: text("notes").default("").notNull(),
  academicRecommendation: text("academic_recommendation").default("").notNull(),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  reporterPersonId: uuid("reporter_person_id").references(() => people.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("support_referral_action_uq").on(t.actionId),
  index("support_referral_stage_idx").on(t.stage),
]);

export const supportPlans = pgTable("support_plans", {
  id: id(),
  referralId: uuid("referral_id").notNull().references(() => supportReferrals.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  intervention: text("intervention").notNull(),
  targetDate: timestamp("target_date", { withTimezone: true }).notNull(),
  createdByPersonId: uuid("created_by_person_id").references(() => people.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("support_plan_referral_idx").on(t.referralId)]);

export const supportServices = pgTable("support_services", {
  id: id(),
  referralId: uuid("referral_id").notNull().references(() => supportReferrals.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").default("scheduled").notNull(),
  outcome: text("outcome").default("").notNull(),
  createdByPersonId: uuid("created_by_person_id").references(() => people.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("support_service_referral_idx").on(t.referralId, t.status)]);

export const supportReferralStageEvents = pgTable("support_referral_stage_events", {
  id: id(),
  referralId: uuid("referral_id").notNull().references(() => supportReferrals.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  note: text("note"),
  actorPersonId: uuid("actor_person_id").references(() => people.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("support_referral_stage_event_idx").on(t.referralId, t.occurredAt)]);
