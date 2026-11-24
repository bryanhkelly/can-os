import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
const guard=read("src/modules/classes/native-class-guardian-authority.server.ts");
const service=read("src/modules/classes/native-class-guardian-enrollment.functions.ts");
const review=read("src/modules/classes/native-class-approvals.functions.ts");
const lifecycle=read("src/modules/classes/native-class-lifecycle.functions.ts");
const ui=read("src/routes/guardian.native-classes.tsx");

describe("native Class guardian and minor enrollment",()=>{
 it("requires one real CAN guardian and returns only its immutable public Person",()=>{
  expect(guard).toContain('actor.role!=="guardian"');
  expect(guard).toContain("actor.sessionAccountId");
  expect(guard).toContain("account?.personId!==actor.actorPersonId");
  expect(guard).toContain('assertCapability(actor,"enrollment.apply")');
  expect(guard).toContain("return {personId:actor.actorPersonId}");
  expect(guard).not.toContain("accessAccountCanonicalPrincipals");
  expect(guard).not.toContain("canonical guardian mapping");
 });
 it("requires current, independently verified minor enrollment authority",()=>{
  expect(guard).toContain("guardianAuthorities.verifiedAt");
  expect(guard).toContain("guardianAuthorities.startsAt");
  expect(guard).toContain("guardianAuthorities.endsAt");
  expect(guard).toContain("learnerProfiles.personId");
  expect(guard).toContain("age<0||age>=18");
  expect(service).toContain("requireNativeGuardianChild");
  expect(review).toContain("requireNativeGuardianChild");
 });
 it("does not create a child Enrollment before separate staff approval and guardian consent",()=>{
  const request=service.slice(service.indexOf("export const requestNativeGuardianClassApproval"),
    service.indexOf("export const getMyNativeGuardianClassApprovals"));
  expect(request).not.toContain("tx.insert(canonicalClassEnrollments)");
  expect(request).toContain("canonicalClassEnrollmentApprovalRequests");
  expect(service).toContain('approval.state!=="approved"');
  expect(service).toContain('approval.reviewedByPersonId===guardian.personId');
  expect(service).toContain('approval.reviewedByPersonId===approval.learnerPersonId');
  expect(service).toContain("assertNativeClassSeatAvailable");
  expect(service).toContain("consentSha256");
  expect(service).toContain('enrollmentMethod:"approval"');
  expect(service).toContain("createInitialNativeClassAttempt(tx,enrollment.id,current)");
 });
 it("keeps guardian withdrawal and staff cancellation history-preserving",()=>{
  expect(service).toContain("withdrawMyGuardianNativeClassEnrollment");
  expect(service).toContain("withdrawNativeClassAttempts(tx,enrollment,cls)");
  expect(service).toContain('set({status:"withdrawn"})');
  expect(lifecycle).toContain('command.action!=="cancel"');
  expect(lifecycle).toContain("canonicalClassEnrollmentApprovalRequests.acceptedEnrollmentId");
  expect(ui).toContain("acceptNativeGuardianClassApproval");
  expect(ui).toContain("withdrawMyGuardianNativeClassEnrollment");
 });
});
