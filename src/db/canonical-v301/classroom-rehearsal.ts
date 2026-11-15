import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
export const facilitatedRehearsalEvents=educationV30.table("facilitated_rehearsal_events",{
  id:uuid("id").defaultRandom().primaryKey(),
  deploymentId:uuid("deployment_id").notNull(),
  courseVersionId:uuid("course_version_id").notNull(),
  siteId:uuid("site_id").notNull(),
  facilitatorPersonId:uuid("facilitator_person_id").notNull(),
  requestId:uuid("request_id").notNull(),
  lessonId:uuid("lesson_id"),
  assetVersionId:uuid("asset_version_id"),
  kind:text("kind").$type<"opened"|"played"|"paused"|"ended">().notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
  uniqueIndex("facilitated_rehearsal_request_uq").on(t.siteId,t.facilitatorPersonId,t.requestId),
  index("facilitated_rehearsal_events_site_idx").on(t.siteId,t.occurredAt),
]);
