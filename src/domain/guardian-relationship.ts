import { and, eq, type SQL, type SQLWrapper } from "drizzle-orm";
import { guardianRelationships } from "@/db/schema/identity";

export type GuardianRelationshipAccess =
  | "relationship"
  | "academic"
  | "enrollment"
  | "attendance-excuse";

type GuardianRelationshipSubjects =
  | { guardianPersonId: string | SQLWrapper; studentPersonId?: string | SQLWrapper }
  | { guardianPersonId?: string | SQLWrapper; studentPersonId: string | SQLWrapper };

export type GuardianRelationshipFilter = GuardianRelationshipSubjects & {
  access?: GuardianRelationshipAccess;
};

export function guardianRelationshipPredicate(
  filter: GuardianRelationshipFilter,
): SQL {
  const conditions: SQL[] = [];
  if (filter.guardianPersonId) {
    conditions.push(
      eq(guardianRelationships.guardianPersonId, filter.guardianPersonId),
    );
  }
  if (filter.studentPersonId) {
    conditions.push(
      eq(guardianRelationships.studentPersonId, filter.studentPersonId),
    );
  }

  switch (filter.access) {
    case "academic":
      conditions.push(eq(guardianRelationships.canViewAcademics, true));
      break;
    case "enrollment":
      conditions.push(eq(guardianRelationships.canManageEnrollment, true));
      break;
    case "attendance-excuse":
      conditions.push(eq(guardianRelationships.canSubmitAttendanceExcuse, true));
      break;
  }

  const predicate = and(...conditions);
  if (!predicate) throw new Error("Guardian relationship subject is required");
  return predicate;
}
