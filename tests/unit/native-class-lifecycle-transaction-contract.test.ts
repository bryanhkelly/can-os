import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-contract checks complement, but do not replace, transaction tests
// against test01. They prevent accidental removal of critical authorization,
// locking and source-of-truth calls during the six-workstream merge.
const read=(path:string)=>readFileSync(path,"utf8");

describe("WS2 native Class transaction and integration invariants",()=>{
  const self=read("src/modules/classes/native-class-enrollment.functions.ts");
  const assigned=read("src/modules/classes/native-class-assignment.functions.ts");
  const exit=read("src/modules/classes/native-class-lifecycle.functions.ts");
  const classAuthority=read("src/modules/classes/native-class-authority.server.ts");

  it("checks all open enrollments instead of five recent history rows",()=>{
    for(const source of [self,assigned]){
      expect(source).toContain('inArray(canonicalClassEnrollments.status,["pending","active"])');
      expect(source).toContain("duplicate open Class enrollments require reconciliation");
      expect(source).not.toContain(".limit(5)");
      expect(source).toContain("assertNativeClassSeatAvailable(");
    }
  });

  it("takes the canonical Class lock before open-seat admission",()=>{
    for(const source of [self,assigned]){
      const lock=source.indexOf('for("update")');
      const capacity=source.indexOf("assertNativeClassSeatAvailable(");
      expect(lock).toBeGreaterThan(0);
      expect(capacity).toBeGreaterThan(lock);
    }
    expect(assigned).toContain("assertNativeClassOperatorExitScope(actor,cls)");
    expect(assigned).toContain(
      "await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
  });

  it("keeps public seat estimates behind the same current authority",()=>{
    expect(self).toContain("await currentClassAuthority(tx,row.classId,now)");
    expect(self).toContain("remainingSeats:");
    expect(self).toContain("Math.max(0,capacity-");
    const ui=read("src/routes/learn.classes.tsx");
    expect(ui).toContain("item.remainingSeats===0");
    expect(ui).toContain("disabled={!adult||!consent||busy||full}");
  });

  it("preserves Course Attempt authority when a Class ends",()=>{
    expect(exit).toContain("assertNativeClassAttemptForExit(");
    expect(exit).toContain("assertNativeClassExitReason(");
    expect(exit).toContain("assertVerifiedAdultNativeClassExit(");
    expect(exit).toContain("assertCurrentCanonicalStaffForMutation(");
    const attemptClose=exit.indexOf("await tx.update(learnerCourseAttempts)");
    const enrollmentClose=exit.indexOf("await tx.update(canonicalClassEnrollments)");
    expect(attemptClose).toBeGreaterThan(0);
    expect(enrollmentClose).toBeGreaterThan(attemptClose);
    expect(exit).toContain("if(decision.alreadyClosed)return");
    expect(exit).toContain("courseAttemptIdsWithdrawn:closedAttemptIds");
    expect(exit).toContain("occurredAt:now,eventType");
    expect(exit).toContain("occurredAt:now,");
    const learnerGate=read("src/modules/learning/canonical-course-participation.server.ts");
    expect(learnerGate).toContain("authorizeNativeClassAttempt({");
  });

  it("denies validity gaps in the canonical Class authority query",()=>{
    expect(classAuthority).toContain("isNull(deploymentOfferingAdoptions.validThrough)");
    expect(classAuthority).toContain("eq(educationOperationOrganizationRoles.status,\"approved\")");
    expect(classAuthority).toContain("gt(siteOrganizationRoles.validThrough,now)");
  });
});
