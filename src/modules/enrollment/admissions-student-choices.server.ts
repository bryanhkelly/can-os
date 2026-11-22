import type { Database } from "@/db/client";
import { enrollments, guardianRelationships, householdMemberships, people, programs, studentProfiles } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const intakeGuardian=alias(people,"intake_guardian");
const guardianHousehold=alias(householdMemberships,"intake_guardian_household");

/** Scoped legacy student/guardian choices used by existing-admissions reuse.
 * This query verifies an active canonical Enrollment and enrollment-capable
 * guardian relationship, never just a matching name or email.
 */
export async function existingStudentChoices(database:Pick<Database,"selectDistinct">,
 actor:AccessContext,programId?:string,student?:{studentProfileId:string;guardianPersonId:string;householdId?:string}){
 return database.selectDistinct({
  programId:programs.id,siteId:programs.siteId,studentProfileId:studentProfiles.id,
  studentFirstName:people.legalFirstName,studentLastName:people.legalLastName,
  guardianPersonId:intakeGuardian.id,guardianFirstName:intakeGuardian.legalFirstName,
  guardianLastName:intakeGuardian.legalLastName,householdId:householdMemberships.householdId,
 }).from(studentProfiles)
  .innerJoin(people,eq(people.id,studentProfiles.personId))
  .innerJoin(enrollments,and(eq(enrollments.studentProfileId,studentProfiles.id),eq(enrollments.status,"active")))
  .innerJoin(programs,and(eq(programs.id,enrollments.programId),eq(programs.organizationId,enrollments.organizationId)))
  .innerJoin(guardianRelationships,guardianRelationshipPredicate({studentPersonId:people.id,access:"enrollment"}))
  .innerJoin(intakeGuardian,eq(intakeGuardian.id,guardianRelationships.guardianPersonId))
  .leftJoin(householdMemberships,eq(householdMemberships.personId,people.id))
  .leftJoin(guardianHousehold,eq(guardianHousehold.personId,intakeGuardian.id))
  .where(and(inArray(programs.organizationId,actor.scope.organizationIds??[]),
   ...(actor.scope.programIds ? [inArray(programs.id,actor.scope.programIds)] : []),
   ...(actor.scope.siteIds ? [inArray(programs.siteId,actor.scope.siteIds)] : []),
   eq(people.active,true),eq(intakeGuardian.active,true),
   or(eq(householdMemberships.householdId,guardianHousehold.householdId),
    and(isNull(householdMemberships.id),isNull(guardianHousehold.id))),
   programId?eq(programs.id,programId):undefined,
   student?and(eq(studentProfiles.id,student.studentProfileId),eq(intakeGuardian.id,student.guardianPersonId),
    student.householdId?eq(householdMemberships.householdId,student.householdId):undefined):undefined))
  .orderBy(people.legalLastName,people.legalFirstName,studentProfiles.id).limit(300);
}
