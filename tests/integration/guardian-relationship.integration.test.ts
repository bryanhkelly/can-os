import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { guardianRelationships, people } from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

describe("shared guardian relationship policy", () => {
  it("preserves independent permissions for exact, joined and batch academic/enrollment queries", async () => {
    const rollback = new Error("rollback-guardian-policy");
    let completed = false;
    let fixturePersonId = "";
    try {
      await db.transaction(async tx => {
        const [student, otherStudent] = await tx.insert(people).values([
          { legalFirstName: "Policy", legalLastName: "Student" },
          { legalFirstName: "Other", legalLastName: "Student" },
        ]).returning();
        if (!student || !otherStudent) throw new Error("Missing policy fixture students");
        fixturePersonId = student.id;
        const guardians = await tx.insert(people).values(Array.from({ length: 8 }, (_, index) => ({
          legalFirstName: "Guardian", legalLastName: `Permission-${index}`,
        }))).returning();
        const fixtures = guardians.map((guardian, index) => ({
          guardianPersonId: guardian.id,
          studentPersonId: student.id,
          relationshipLabel: "parent",
          canViewAcademics: Boolean(index & 1),
          canManageEnrollment: Boolean(index & 2),
          canSubmitAttendanceExcuse: Boolean(index & 4),
        }));
        await tx.insert(guardianRelationships).values(fixtures);
        const sortIds = (rows: Array<{ guardianPersonId: string }>) => rows.map(row => row.guardianPersonId).sort();
        for (const [access, flag] of [
          ["academic", "canViewAcademics"],
          ["enrollment", "canManageEnrollment"],
          ["attendance-excuse", "canSubmitAttendanceExcuse"],
        ] as const) {
          const expected = fixtures.filter(row => row[flag]).map(row => row.guardianPersonId).sort();
          const exact = await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
            studentPersonId: student.id, access,
          }));
          expect(sortIds(exact)).toEqual(expected);
          const batch = await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
            studentPersonIds: [student.id, otherStudent.id], access,
          }));
          expect(sortIds(batch)).toEqual(expected);
          const joined = await tx.select({ guardianPersonId: guardianRelationships.guardianPersonId })
            .from(people).innerJoin(guardianRelationships, guardianRelationshipPredicate({
              studentPersonId: people.id, access,
            })).where(eq(people.id, student.id));
          expect(sortIds(joined)).toEqual(expected);
          expect(await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
            studentPersonIds: [], access,
          }))).toEqual([]);
          for (const fixture of fixtures) {
            const allowed = await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
              guardianPersonId: fixture.guardianPersonId, studentPersonId: student.id, access,
            }));
            expect(allowed).toHaveLength(fixture[flag] ? 1 : 0);
            expect(await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
              guardianPersonId: fixture.guardianPersonId, studentPersonId: otherStudent.id, access,
            }))).toEqual([]);
          }
        }
        expect(await tx.select().from(guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonId: student.id,
        }))).toHaveLength(8);
        completed = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(completed).toBe(true);
    expect(await db.select().from(people).where(eq(people.id, fixturePersonId))).toEqual([]);
  });
});
