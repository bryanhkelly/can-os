import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
const command=read("src/modules/classes/native-class-invitations.functions.ts");
const enroll=read("src/modules/classes/native-class-enrollment.functions.ts");
const ddl=read("database/canonical/v3.0.1/patch-native-class-enrollment-authority-ws2.sql");
const policy=read("src/domain/native-class-lifecycle.ts");
const ui=read("src/routes/class.tsx");

describe("WS2 native Class invitation authority",()=>{
 it("never confuses an invitation with an Enrollment or a held seat",()=>{
  expect(ddl).toContain("class_enrollment_invitations");
  expect(ddl).toContain("ws2_invitation_one_pending_per_person");
  expect(command).toContain("seatReserved:false");
  expect(command).not.toContain("tx.insert(canonicalClassEnrollments)");
  expect(command).not.toContain("tx.insert(learnerCourseAttempts)");
 });
 it("requires the real verified recipient and current exact Site staff grant",()=>{
  for(const rule of [
    "assertNativeClassOperatorExitScope(actor,cls)",
    "assertCurrentCanonicalStaffForMutation(tx,request,actor)",
    "verifiedAdultOn(person?.birthDate,now)",
    "canonicalAccountGrants.personId,data.learnerPersonId",
    'canonicalAccountGrants.roleCode,"learner"',
    "version.enrollmentMethods.includes(\"invitation\")",
    "pending Class invitation already exists",
    "conflicting invitation request replay",
  ])expect(command).toContain(rule);
 });
 it("accepts only a current exact Person+Class+Offering+Site invitation",()=>{
  for(const rule of [
    "invitation.expiresAt<=now",
    "invitation.learnerPersonId!==learnerPersonId",
    "invitation.classId!==instance.id",
    "invitation.classOfferingVersionId!==version.id",
    "invitation.operatingOrganizationId!==current.operatingOrganizationId",
    "invitation.siteId!==current.siteId",
    "invitation.creditMode!==data.creditMode",
    "assertCurrentNativeClassLearnerForMutation(tx,request,actor)",
    "assertNativeClassSeatAvailable",
    "consentSha256=nativeClassConsentDigest",
    'enrollmentMethod:invitation?"invitation":"self"',
    'state:"accepted",respondedAt:now,acceptedEnrollmentId:enrollment.id',
    'eventType:"ClassInvitationAccepted"',
  ])expect(enroll).toContain(rule);
 });
 it("makes learner acceptance and decline accessible without bypassing consent",()=>{
  for(const rule of [
    "getMyNativeClassInvitations()","declineNativeClassInvitation",
    "invitationId:item.invitationId","consentAccepted:true",
    "item.consentText","I accept the current participation",
  ])expect(ui).toContain(rule);
  expect(ui).toContain("An invitation does not reserve a seat");
 });
 it("permits only implemented operational Class enrollment modes",()=>{
  expect(policy).toContain('method !== "invitation"');
  expect(policy).toContain('method !== "assignment"');
  expect(policy).not.toContain('method !== "approval" &&');
 });
 it("models pending approval, transfer and repeat without conferring learner rights",()=>{
  for(const t of [
    "class_enrollment_approval_requests",
    "class_enrollment_transfer_requests",
    "class_enrollment_repeat_authorizations",
    "ws2_approval_independent_review",
    "ws2_transfer_one_pending_per_enrollment",
    "ws2_repeat_independent",
    "FORCE ROW LEVEL SECURITY",
    "REVOKE ALL ON education_v30",
  ])expect(ddl).toContain(t);
  expect(ddl).not.toContain("GRANT INSERT");
 });
});
