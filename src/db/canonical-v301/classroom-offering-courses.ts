import { uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
/** Pre-existing approved Offering-to-Course relationship for enrollment-free rehearsal. */
export const classroomOfferingCourses = educationV30.table("offering_courses",{
  offeringVersionId:uuid("offering_version_id").notNull(),
  courseVersionId:uuid("course_version_id").notNull(),
});
