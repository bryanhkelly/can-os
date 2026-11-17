import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const source=read("src/modules/classes/native-class-adult-review.functions.ts");
const activation=read("src/modules/classes/native-class-reviewed-onboarding.functions.ts");

describe("independent App Admin review for first-time Class learner activation",()=>{
 it("never treats the applicant as their own reviewer",()=>{
   expect(source).toContain('assertCapability(actor,"platform.admin")');
   expect(source).toContain('actor.role!=="app_admin"');
   expect(source).toContain("actor.sessionAccountId");
   expect(source).toContain("actor.accountId===data.accessAccountId");
   expect(source).toContain("account.personId===actor.actorPersonId");
   expect(source).toContain('eq(accountPersonGrants.role,"app_admin")');
   expect(source).toContain('eq(accountPersonGrants.active,true)');
   expect(source).toContain("actor.grantId");
   expect(source).toContain("isNull(accountPersonGrants.organizationId)");
   expect(source).toContain("isNull(accountPersonGrants.siteId)");
 });
 it("requires independent evidence, exact verified CAN Person and an active home Organization",()=>{
   expect(source).toContain("evidenceIndependentlyChecked:z.literal(true)");
   expect(source).toContain("verifiedAdultOn(data.verifiedBirthDate,now)");
   expect(source).toContain('reviewer.personId!==actor.actorPersonId');
   expect(source).toContain('account.personId');
   expect(source).toContain('g.role==="student"');
   expect(source).toContain('eq(canonicalEnrollmentOrganizations.status,"active")');
   expect(source).toContain('if(operator||link||native)');
   expect(source).toContain('if(prior)');
 });
 it("never turns an adult review into an enrollment or a native session",()=>{
   expect(source).toContain("tx.insert(accessAdultLearningReviews)");
   expect(source).toContain('action:"class.adult_identity.review_approved"');
   expect(source).not.toContain("issueNativeLearnerSession");
   expect(source).not.toContain("tx.insert(canonicalClassEnrollments)");
   expect(source).not.toContain("tx.insert(canonicalPersons)");
   expect(source).not.toContain("tx.insert(canonicalAccountGrants)");
   expect(activation).toContain('review.status!=="approved"');
   expect(activation).toContain("review.accessPersonId!==owner.personId");
 });
 it("revocation ends all original learner grants and native sessions without deleting history",()=>{
   expect(source).toContain("export const revokeAdultClassLearnerReview");
   expect(source).toContain('const alreadyRevoked=review.status==="revoked"');
   expect(source).not.toContain('if(review.status==="revoked")return');
   expect(source).toContain("reason:z.string().trim().min(10).max(500)");
   expect(source).toContain('eq(canonicalAccountGrants.roleCode,"learner")');
   expect(source).toContain('eq(canonicalAccountGrants.accountId,review.canonicalAccountId)');
   expect(source).toContain('eq(canonicalSessions.accountId,review.canonicalAccountId)');
   expect(source).toContain('tx.update(canonicalAccountGrants).set({');
   expect(source).toContain('tx.update(canonicalSessions).set({revokedAt:now})');
   expect(source).toContain('tx.update(accessAdultLearningReviews).set({status:"revoked"})');
   expect(source).toContain('action:"class.adult_identity.review_revoked"');
   expect(source).not.toContain("tx.delete(canonicalPersons)");
   expect(source).not.toContain("tx.delete(canonicalClassEnrollments)");
 });
 it("surfaces independent decisions only inside existing platform workspace after RLS readiness",()=>{
   const ui=read("src/routes/platform.tsx");
   const service=read("src/modules/identity/platform-admin.functions.ts");
   expect(ui).toContain("summary.reviewedAdultIdentityReady");
   expect(ui).toContain("approveAdultClassLearnerReview");
   expect(ui).toContain("revokeAdultClassLearnerReview");
   expect(ui).toContain("I independently checked identity and adult eligibility");
   expect(ui).toContain("Secure evidence reference");
   expect(service).toContain("access_adult_learning_reviews");
   expect(service).toContain("c.relforcerowsecurity");
 });
});
