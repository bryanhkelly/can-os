import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { guardianRelationships } from "@/db/schema/identity";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

const dialect = new PgDialect();

describe("guardian relationship predicates", () => {
  it("requires the matching guardian, student, and academic permission", () => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      guardianPersonId: "guardian-1",
      studentPersonId: "student-1",
      access: "academic",
    }));

    expect(query.sql).toContain(guardianRelationships.guardianPersonId.name);
    expect(query.sql).toContain(guardianRelationships.studentPersonId.name);
    expect(query.sql).toContain(guardianRelationships.canViewAcademics.name);
    expect(query.params).toEqual(["guardian-1", "student-1", true]);
  });

  it("keeps relationship-only operations distinct from permission-gated access", () => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      guardianPersonId: "guardian-1",
      studentPersonId: "student-1",
    }));

    expect(query.sql).toContain(guardianRelationships.guardianPersonId.name);
    expect(query.sql).toContain(guardianRelationships.studentPersonId.name);
    expect(query.sql).not.toContain(guardianRelationships.canViewAcademics.name);
    expect(query.params).toEqual(["guardian-1", "student-1"]);
  });

  it.each([
    ["enrollment", guardianRelationships.canManageEnrollment],
    ["attendance-excuse", guardianRelationships.canSubmitAttendanceExcuse],
  ] as const)("requires the configured %s permission", (access, column) => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      guardianPersonId: "guardian-1",
      studentPersonId: "student-1",
      access,
    }));

    expect(query.sql).toContain(column.name);
    expect(query.params).toEqual(["guardian-1", "student-1", true]);
  });
});
