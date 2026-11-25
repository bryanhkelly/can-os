import { pgTable } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";
/** Pre-existing approved Offering-to-Course relationship for enrollment-free rehearsal. */
export const classroomOfferingCourses = pgTable("offering_courses",{
  offeringVersionId:uuid("offering_version_id").notNull(),
  courseVersionId:uuid("course_version_id").notNull(),
});
