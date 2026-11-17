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

  it("re-reads locked Offering terms after Class lock to block stale publication",()=>{
    const locator=self.indexOf("const [sourceVersion]=await tx.select({");
    const classLock=self.indexOf('eq(canonicalClasses.id,sourceVersion.classId)).for("update")');
    const lockedTerms=self.indexOf("const [version]=await tx.select().from(canonicalClassOfferingVersions)");
    const currentTerms=self.indexOf("assertNativeSelfEnrollmentEligible({");
    expect(locator).toBeGreaterThan(0);
    expect(classLock).toBeGreaterThan(locator);
    expect(lockedTerms).toBeGreaterThan(classLock);
    expect(self.slice(lockedTerms,currentTerms)).toContain('.for("update").limit(1)');
    expect(currentTerms).toBeGreaterThan(lockedTerms);
    const admissionClock=self.indexOf("const now=new Date();",lockedTerms);
    expect(admissionClock).toBeGreaterThan(lockedTerms);
    expect(admissionClock).toBeLessThan(currentTerms);
    expect(self).not.toContain('eq(canonicalClasses.id,version.classId)).for("update")');
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

  it("revalidates current learner session inside both enrollment transactions",()=>{
    const verifier=read("src/modules/classes/native-class-learner-session.server.ts");
    expect(verifier).toContain("v301_canonical_session_context");
    expect(verifier).toContain("canonicalSessionDigestFromRequest(request)");
    expect(verifier).toContain("assertNativeClassLearnerSessionForExit(");
    expect(verifier).toContain("actor.scope.organizationIds[0]");
    expect(verifier).not.toContain("operatingOrganizationId");
    expect(self).toContain("await assertCurrentNativeClassLearnerForMutation(tx,request,actor)");
    expect(exit).toContain("await assertCurrentNativeClassLearnerForMutation(tx,request,actor)");
  });

  it("keeps public seat estimates behind the same current authority",()=>{
    expect(self).toContain("await currentClassAuthority(tx,row.classId,now)");
    expect(self).toContain("remainingSeats:");
    expect(self).toContain("Math.max(0,capacity-");
    const ui=read("src/routes/learn.classes.tsx");
    expect(ui).toContain("item.remainingSeats===0");
    expect(ui).toContain("disabled={!adult||!consent||busy||full}");
  });

  it("exposes complete per-Person Class history through stable keyset pagination",()=>{
    expect(self).toContain("export const getMyNativeClassEnrollmentHistoryPage=");
    expect(self).toContain("myClassHistoryInput.parse(raw)");
    expect(self).toContain("lt(canonicalClassEnrollments.enrolledAt,");
    expect(self).toContain("lt(canonicalClassEnrollments.id,data.cursor.classEnrollmentId)");
    expect(self).toContain("eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId)");
    expect(self).toContain("desc(canonicalClassEnrollments.id)).limit(51)");
    expect(self).toContain("const items=rows.slice(0,50)");
    expect(self).toContain("classOfferingVersionId:canonicalClassEnrollments.classOfferingVersionId");
    const client=read("src/routes/learn.classes.tsx");
    expect(client).toContain("getMyNativeClassEnrollmentHistoryPage({");
    expect(client).toContain("enrolled.data?.pages.flatMap(page=>page.items)");
    expect(client).toContain("Load older Classes");
    expect(client).not.toContain("getMyNativeClassEnrollments()");
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
