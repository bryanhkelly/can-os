import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, guardianRelationships, studentProfiles, enrollments, sections, sectionTeachers, assessments } from "@/db/schema";

/** Read-only synthetic three-persona preflight. The runner requires an isolated test database. */
describe("authenticated academic journey fixtures", () => {
 it("joins student, guardian, teacher, enrollment and published assignments", async () => {
  if(process.env.APP_ENV !== "test" || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true")
   throw new Error("Isolated TEST_DATABASE_URL required");
  const studentPersonId="f1000000-0000-4000-8000-000000000005";
  const teacherPersonId="f1000000-0000-4000-8000-000000000006";
  const guardianPersonId="f3000000-0000-4000-8000-000000000007";
  const memberships=await db.select({role:accountPersonGrants.role,personId:accountPersonGrants.personId})
   .from(accountPersonGrants).innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
   .where(and(eq(accountPersonGrants.active,true),eq(accountPersonGrants.organizationId,"f1000000-0000-4000-8000-000000000002"),eq(accessAccounts.disabled,false)));
  for(const [role,personId] of [["student",studentPersonId],["teacher",teacherPersonId],["guardian",guardianPersonId]])
   expect(memberships.some(m=>m.role===role&&m.personId===personId),`Missing active ${role} demo membership`).toBe(true);
  const guardians=await db.select().from(guardianRelationships).where(and(
   eq(guardianRelationships.guardianPersonId,guardianPersonId),
   eq(guardianRelationships.studentPersonId,studentPersonId),
   eq(guardianRelationships.canViewAcademics,true),
  ));
  expect(guardians).toHaveLength(1);
  const [student]=await db.select({id:studentProfiles.id}).from(studentProfiles).where(eq(studentProfiles.personId,studentPersonId)).limit(1);
  expect(student).toBeDefined();
  if(!student) return;
  const active=await db.select({sectionId:enrollments.sectionId}).from(enrollments)
   .where(and(eq(enrollments.studentProfileId,student.id),eq(enrollments.kind,"section"),eq(enrollments.status,"active")));
  const sectionIds=active.map(x=>x.sectionId).filter((id):id is string=>!!id);
  expect(sectionIds.length).toBeGreaterThan(0);
  const teacherSections=await db.select({sectionId:sectionTeachers.sectionId}).from(sectionTeachers)
   .innerJoin(sections,eq(sections.id,sectionTeachers.sectionId))
   .where(and(eq(sectionTeachers.personId,teacherPersonId),inArray(sectionTeachers.sectionId,sectionIds)));
  expect(teacherSections.length).toBeGreaterThan(0);
  const published=await db.select({id:assessments.id,metadata:assessments.metadata}).from(assessments)
   .where(and(inArray(assessments.sectionId,teacherSections.map(x=>x.sectionId)),eq(assessments.status,"published")));
  expect(published.some(x=>x.metadata.synthetic===true)).toBe(true);
 });
});
