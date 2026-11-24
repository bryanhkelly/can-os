import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");

describe("native Class adult approval source contract",()=>{
 const command=read("src/modules/classes/native-class-approvals.functions.ts");
 const enrollment=read("src/modules/classes/native-class-enrollment.functions.ts");
 const migration=read("database/canonical/v3.0.1/patch-native-class-adult-approval-lifecycle.sql");
 const learner=read("src/routes/class.tsx");
 const manager=read("src/routes/class_.$classId.tsx");

 it("requires a verified adult learner and a current published approval Offering",()=>{
  expect(command).toContain('actor.role!=="learner"');
  expect(command).toContain('!verifiedAdultOn(person?.birthDate,now)');
  expect(command).toContain('terms.enrollmentMethods.includes("approval")');
  expect(command).toContain("assertCurrentNativeClassLearnerForMutation");
  expect(command).toContain("seatReserved:false");
  expect(command).toContain("class.approval.expired");
  expect(command).toContain("ClassApprovalExpired");
 });
 it("requires an independent exact-Site staff decision",()=>{
  expect(command).toContain("assertNativeClassOperatorExitScope(actor,cls)");
  expect(command).toContain("assertCurrentCanonicalStaffForMutation(tx,request,actor)");
  expect(command).toContain("approval.applicantPersonId===actor.actorPersonId");
  expect(command).toContain('approval.state!=="pending"||approval.expiresAt<=now');
 });
 it("does not create a Class Enrollment or Course Attempt on approval",()=>{
  expect(command).not.toContain("tx.insert(canonicalClassEnrollments)");
  expect(command).not.toContain("tx.insert(learnerCourseAttempts)");
  expect(command).not.toContain("createInitialNativeClassAttempt(");
  expect(migration).toContain("ws2_approval_acceptance_only_after_review");
  expect(migration).toContain("accepted_enrollment_id IS NULL OR");
 });
 it("atomically binds final admission to the exact reviewed adult request",()=>{
  for(const guard of [
   "approval.state!==\"approved\"","approval.expiresAt<=now",
   "approval.acceptedEnrollmentId",
   "approval.applicantPersonId!==learnerPersonId",
   "approval.classOfferingVersionId!==version.id",
   "approval.siteId!==current.siteId",
   'version.enrollmentMethods.includes("approval")',
   "assertNativeClassSeatAvailable",
   'enrollmentMethod:invitation?"invitation":approval?"approval":"self"',
   "ClassApprovalAccepted",
  ])expect(enrollment).toContain(guard);
 });
 it("offers adult request, independent staff review and fresh learner consent",()=>{
  expect(learner).toContain("requestNativeClassApproval");
  expect(learner).toContain("getMyNativeClassApprovals");
  expect(learner).toContain("approvalRequestId:item.approvalRequestId");
  expect(learner).toContain("I accept the current Class participation");
  expect(manager).toContain("getNativeClassApprovalQueue");
  expect(manager).toContain("decideNativeClassApproval");
  expect(manager).toContain("reviewReason.trim()");
 });
});
