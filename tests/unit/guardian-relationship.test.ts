import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { guardianRelationships } from "@/db/schema/identity";
import { guardianRelationshipPredicate, schoolGuardianAuthorityCompatible } from "@/domain/guardian-relationship";

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
    ["pickup", guardianRelationships.canManagePickup],
  ] as const)("requires the configured %s permission", (access, column) => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      guardianPersonId: "guardian-1",
      studentPersonId: "student-1",
      access,
    }));

    expect(query.sql).toContain(column.name);
    expect(query.params).toEqual(["guardian-1", "student-1", true]);
  });

  it("supports column-correlated joins without binding the column as a value", () => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      guardianPersonId: "guardian-1",
      studentPersonId: guardianRelationships.studentPersonId,
      access: "enrollment",
    }));
    expect(query.params).toEqual(["guardian-1", true]);
    expect(query.sql).toContain('"guardian_relationships"."student_person_id"');
    expect(query.sql).toContain('"guardian_relationships"."can_manage_enrollment"');
    expect(query.sql).not.toContain("can_view_academics");
  });

  it("keeps batch recipients restricted to the requested students and permission", () => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      studentPersonIds: ["student-1", "student-2"],
      access: "academic",
    }));
    expect(query.params).toEqual(["student-1", "student-2", true]);
    expect(query.sql).toContain(" in ");
    expect(query.sql).toContain("can_view_academics");
    expect(query.sql).not.toContain("can_manage_enrollment");
  });

  it("denies an empty batch instead of selecting every guardian", () => {
    const query = dialect.sqlToQuery(guardianRelationshipPredicate({
      studentPersonIds: [],
      access: "academic",
    }));
    expect(query.sql).toContain("false");
    expect(query.params).toEqual([true]);
  });
});

describe("guardian authority convergence",()=>{
  const verified={metadata:{verification:"verified"},canManageEnrollment:true,canViewAcademics:true};
  it("requires independent native verification even when no school relationship exists",()=>{
    // Compatibility is not an authorization grant; the owning native reader
    // independently requires exactly one current verified native authority.
    expect(schoolGuardianAuthorityCompatible(undefined,"enrollment")).toBe(true);
  });
  it.each(["pending","revoked","unverified","unknown"] as const)("denies contradictory %s school records",verification=>{
    const row={...verified,metadata:{verification}};
    expect(schoolGuardianAuthorityCompatible(row,"enrollment")).toBe(false);
    expect(schoolGuardianAuthorityCompatible(row,"instruction")).toBe(false);
  });
  it("preserves independently restricted permissions",()=>{
    const readOnly={...verified,canManageEnrollment:false};
    expect(schoolGuardianAuthorityCompatible(readOnly,"instruction")).toBe(true);
    expect(schoolGuardianAuthorityCompatible(readOnly,"enrollment")).toBe(false);
    const enrollmentOnly={...verified,canViewAcademics:false};
    expect(schoolGuardianAuthorityCompatible(enrollmentOnly,"instruction")).toBe(false);
    expect(schoolGuardianAuthorityCompatible(enrollmentOnly,"enrollment")).toBe(true);
  });
});
