import { timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";

/**
 * Existing canonical placement tables. A school enrollment must be currently
 * placed at the exact Site hosting a facilitated room. These are read models,
 * not new migrations or classroom enrollments.
 */
export const classroomDeploymentSites = educationV30.table("deployment_sites", {
  id: uuid("id").primaryKey(),
  deploymentId: uuid("deployment_id").notNull(),
  siteId: uuid("site_id").notNull(),
});

export const classroomEnrollmentSitePlacements = educationV30.table("enrollment_site_placements", {
  id: uuid("id").primaryKey(),
  enrollmentId: uuid("enrollment_id").notNull(),
  deploymentId: uuid("deployment_id").notNull(),
  deploymentSiteId: uuid("deployment_site_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
});
