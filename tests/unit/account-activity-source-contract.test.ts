import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
const school=read("src/modules/learning/account-school-participation.functions.ts");
const activity=read("src/modules/learning/my-activity.functions.ts");
const native=read("src/modules/classes/native-class-enrollment.functions.ts");
const noncredit=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
const waitlist=read("src/modules/enrollment/noncredit-waitlist.functions.ts");
const participant=read("src/modules/enrollment/noncredit-self-enrollment-identity.server.ts");
const ui=read("src/routes/learn.my-activity.tsx");

describe("account-wide participation source authority and pagination",()=>{
 it("never uses a browser-supplied Person, Site, or role to grant history",()=>{
  for(const phrase of [
    "getCommandContext(getRequest())",
    "account.personId!==actor.actorPersonId",
    "readSessionGrants(actor.accountId,account.email)",
    "selectActivityMemberships(",
    "guardianRelationshipPredicate",
    "profileScope(",
    "getProfiles(\"academic\")",
    "getProfiles(\"enrollment\")",
  ])expect(school).toContain(phrase);
  expect(school).not.toContain("session.selectedSiteId");
  expect(school).not.toContain("eq(s.sections.active,true)");
 });
 it("retains school, Program, enrichment and Event source identity across pages",()=>{
  for(const name of ["school_section","school_program","family_enrichment","calendar_event"])
    expect(school).toContain(name);
  expect(school).toContain("pageSize=40");
  expect(school).toContain("createdAtCursor:cursorText(");
  expect(school).toContain("before(s.enrollments.createdAt,s.enrollments.id,data.cursor)");
  expect(school).toContain("before(s.activityRegistrations.createdAt,s.activityRegistrations.id,data.cursor)");
  expect(school).toContain("before(s.calendarEventParticipants.createdAt,s.calendarEventParticipants.id,data.cursor)");
  expect(school).not.toContain(".limit(200)");
 });
 it("requires source evidence for academic grades and independent guardian Events",()=>{
  for(const phrase of [
    'eq(s.sectionGrades.status,"finalized")',
    "isNotNull(s.sectionGrades.finalizedByPersonId)",
    "isNotNull(s.sectionGrades.finalizedAt)",
    "referenceId:grade.id",
    "guardianRelationshipPredicate",
    "eventParticipantAccess",
    'eq(s.calendarEventParticipants.responseStatus,"accepted")',
  ])expect(school).toContain(phrase);
  expect(school).not.toContain("enrollmentStatus===\"completed\"?grade");
 });
 it("uses exact CAN-to-native Person proof but never issues a new learner cookie",()=>{
  const method=native.slice(native.indexOf("export const getMyNativeClassHistoryForCanAccountPage"));
  for(const phrase of [
    "getCommandContext(getRequest())",
    "account.personId!==actor.actorPersonId",
    "accessAccountNoncreditPrincipals.accessPersonId",
    "noncredit.canonicalAccountId",
    "noncredit.canonicalPersonId",
    "independentlyVerified.canonicalPersonId",
    "noncredit.canonicalPersonId!==independentlyVerified.canonicalPersonId",
    'eq(canonicalAccountGrants.roleCode,"learner")',
    "readNativeClassHistoryPage",
  ])expect(method).toContain(phrase);
  expect(method).not.toContain("issueNativeLearnerSession");
  expect(method).not.toContain("canonicalSessionCookie");
  expect(method).not.toContain("tx.insert(");
 });
 it("does not let a later Course Attempt duplicate a noncredit Registration",()=>{
  for(const phrase of [
    "personalNoncreditCursor",
    "getMyNoncreditSelfEnrollmentHistoryPage",
    "cursor.registrationId",
    "noncredit_registration_id",
    "ORDER BY attempt.attempt_no DESC",
    "noncredit_completion_decisions later",
  ])expect(noncredit).toContain(phrase);
  expect(noncredit).not.toContain("const registrations=await db.selectDistinctOn");
 });
 it("paginates only original Person-owned waitlist opportunities",()=>{
  for(const phrase of [
    "getMyNoncreditWaitlistPage",
    "waitlistCursor",
    "cursor.waitlistId",
    "eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId)",
    "eq(noncreditEnrollmentWaitlist.accessPersonId,owner.personId)",
    "requireNoncreditParticipantAccount()",
  ])expect(waitlist).toContain(phrase);
  expect(participant).toContain("account.personId!==personId");
  expect(waitlist).toContain("assertNoncreditParticipantRelease(current,release)");
  expect(waitlist).toContain("limit(51)");
  expect(waitlist).toContain("nextCursor");
  expect(waitlist).not.toContain("tx.insert(canonicalClassEnrollments)");
 });
 it("exposes unlimited continuation in My Activity, with per-source failures",()=>{
  expect(activity).toContain("getMyActivitySourcePage");
  expect(activity).toContain("getMyNativeClassHistoryForCanAccountPage");
  expect(activity).toContain("getMyAccountSchoolParticipationPage");
  expect(activity).toContain("getMyNoncreditSelfEnrollmentHistoryPage");
  expect(activity).not.toContain("readBoundedNativeClassHistory");
  expect(activity).toContain("nextCursors");
  expect(activity).toContain("getMyActivityOpportunityPage");
  expect(activity).toContain("getMyNoncreditWaitlistPage");
  expect(ui).toContain("nextOpportunityCursor");
  expect(ui).toContain("getMyActivityOpportunityPage");
  expect(ui).toContain("Load older activity");
  expect(ui).toContain("assertParticipationHistoryPage");
  expect(ui).toContain("Promise.allSettled");
 });
});
