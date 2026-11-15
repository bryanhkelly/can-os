import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
import { facilitatedLearningSessions } from "./facilitated-learning";

/**
 * CAN OS classroom booking overlays canonical delivery_sessions. All date,
 * modality, space and deployment-site constraints remain authoritative there.
 * This table contributes Course, facilitator and live-room linkage only; it
 * does not create an independent scheduling or learner enrollment system.
 */
export const canonicalDeliverySessions = educationV30.table("delivery_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  deploymentId: uuid("deployment_id").notNull(),
  deploymentSiteId: uuid("deployment_site_id"),
  siteId: uuid("site_id"),
  startsAt: timestamp("starts_at", {withTimezone:true}).notNull(),
  endsAt: timestamp("ends_at", {withTimezone:true}).notNull(),
  modality: text("modality").notNull(),
  modalityVocabularyCode: text("modality_vocabulary_code").notNull().default("delivery_modality"),
});

export const facilitatedClassroomPlans = educationV30.table("facilitated_classroom_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  deliverySessionId: uuid("delivery_session_id").notNull()
    .references(()=>canonicalDeliverySessions.id),
  deploymentId: uuid("deployment_id").notNull(),
  courseVersionId: uuid("course_version_id").notNull(),
  siteId: uuid("site_id").notNull(),
  hostOrganizationId: uuid("host_organization_id").notNull(),
  facilitatorPersonId: uuid("facilitator_person_id").notNull(),
  requestId: uuid("request_id").notNull(),
  state: text("state").$type<"scheduled"|"started"|"cancelled">().notNull().default("scheduled"),
  facilitatedSessionId: uuid("facilitated_session_id")
    .references(()=>facilitatedLearningSessions.id),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("facilitated_plans_delivery_session_uq").on(t.deliverySessionId),
  uniqueIndex("facilitated_plans_request_uq").on(t.hostOrganizationId,t.facilitatorPersonId,t.requestId),
  uniqueIndex("facilitated_plans_live_room_uq").on(t.facilitatedSessionId),
  index("facilitated_plans_facilitator_idx").on(t.hostOrganizationId,t.facilitatorPersonId,t.state),
  index("facilitated_plans_site_course_idx").on(t.siteId,t.courseVersionId),
]);
