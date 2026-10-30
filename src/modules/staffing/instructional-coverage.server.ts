import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryArrangements, sectionTeachers } from "@/db/schema";
import { coveringInstructorIds } from "./instructional-coverage";
import {
  teachingStaffingContext,
  type TeachingEligibilityReader,
} from "./teaching-eligibility.server";

export async function evaluateInstructionalCoverage(
  sectionId: string,
  executor: TeachingEligibilityReader = db,
) {
  const section = await teachingStaffingContext(sectionId, executor);
  const arrangements = await executor.select({
    instructorPersonId: deliveryArrangements.instructorPersonId,
    academicProviderOrganizationId: deliveryArrangements.academicProviderOrganizationId,
    effectiveFrom: deliveryArrangements.effectiveFrom,
    effectiveThrough: deliveryArrangements.effectiveThrough,
  }).from(deliveryArrangements).where(and(
    eq(deliveryArrangements.sectionId, sectionId),
    eq(deliveryArrangements.status, "active"),
  ));
  const teachers = await executor.select({ personId: sectionTeachers.personId }).from(sectionTeachers)
    .where(and(eq(sectionTeachers.sectionId, sectionId), eq(sectionTeachers.role, "teacher")));
  const assignedTeacherIds = [...new Set(teachers.map(teacher => teacher.personId))];
  const coveredInstructorIds = coveringInstructorIds(
    section.window,
    section.providerId,
    assignedTeacherIds,
    arrangements,
  );
  return {
    covered: coveredInstructorIds.size > 0,
    assignedTeacherIds,
    coveredInstructorIds,
    window: section.window,
  };
}
