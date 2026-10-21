import type { Database } from "@/db/client";
import { guardianRelationships, householdMemberships, people, studentProfiles } from "@/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** New prospective students never acquire verified family permissions from an application. */
export async function createProspectiveStudent(tx: Transaction, input: {
  householdId: string; guardianPersonId: string; firstName: string; lastName: string;
  gradeLevel?: string; origin: "registrar_intake" | "family_application";
}) {
  const [person] = await tx.insert(people).values({
    legalFirstName: input.firstName, legalLastName: input.lastName, metadata: { origin: input.origin },
  }).returning({ id: people.id });
  if (!person) throw new Error("Unable to create prospective student");
  const [student] = await tx.insert(studentProfiles).values({
    personId: person.id, gradeLevel: input.gradeLevel || null, metadata: { origin: input.origin },
  }).returning({ id: studentProfiles.id });
  if (!student) throw new Error("Unable to create student profile");
  await tx.insert(householdMemberships).values({
    householdId: input.householdId, personId: person.id, relationshipLabel: "student",
  });
  await tx.insert(guardianRelationships).values({
    guardianPersonId: input.guardianPersonId, studentPersonId: person.id, relationshipLabel: "guardian",
    canViewAcademics: false, canManageEnrollment: false, canSubmitAttendanceExcuse: false,
    metadata: { verification: "pending", source: input.origin },
  });
  return { studentProfileId: student.id, studentPersonId: person.id };
}
