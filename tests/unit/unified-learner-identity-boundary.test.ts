import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {verifiedAdultOn} from "@/domain/native-class-enrollment";
import {normalizeClientError} from "@/lib/client-error";
import {DomainError} from "@/domain/errors";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");

describe("one canonical learning Person across Courses and Classes",()=>{
 it("checks exact adult age, future and invalid calendar dates",()=>{
   const today=new Date("2026-11-17T12:00:00Z");
   expect(verifiedAdultOn("2008-11-17",today)).toBe(true);
   expect(verifiedAdultOn("2008-11-18",today)).toBe(false);
   expect(verifiedAdultOn("2015-01-01",today)).toBe(false);
   expect(verifiedAdultOn("2000-02-30",today)).toBe(false);
   expect(verifiedAdultOn("1900-01-01",today)).toBe(false);
   expect(verifiedAdultOn(null,today)).toBe(false);
 });
 it("uses one independent account-Person grant invariant everywhere",()=>{
   const helper=read("src/modules/identity/unambiguous-adult-account.server.ts");
   expect(helper).toContain("assertRawAccountPerson(");
   for(const path of [
     "src/modules/classes/native-class-adult-review.functions.ts",
     "src/modules/classes/native-class-reviewed-onboarding.functions.ts",
     "src/modules/classes/native-class-session-recovery.functions.ts",
     "src/modules/enrollment/noncredit-self-enrollment.functions.ts",
   ])expect(read(path)).toContain("assertUnambiguousAdultAccount(");
 });
 it("upgrades an exact noncredit Person rather than creating duplicate identities",()=>{
   const review=read("src/modules/classes/native-class-adult-review.functions.ts");
   const activation=read("src/modules/classes/native-class-reviewed-onboarding.functions.ts");
   expect(review).toContain("link.accessPersonId!==account.personId");
   expect(review).toContain("link.personId!==account.personId");
   expect(activation).toContain("assertCurrentAdultReviewEvidence(tx,review,now)");
   expect(activation).toContain("nativePersonId=owner.personId");
   expect(activation).not.toContain("tx.insert(canonicalPersons)");
   expect(activation).toContain("existingPersonReused:Boolean(linked)");
   expect(activation).toContain("if(linked){");
   expect(activation).toContain('if(Boolean(sameEmail)!==Boolean(linked)');
 });
 it("requires real independently reviewed private evidence before granting adulthood",()=>{
   const review=read("src/modules/classes/native-class-adult-review.functions.ts");
   for(const required of [
     'evidence.category!=="adult_identity_verification"',
     'evidence.storageProvider!=="cloudflare_r2"',
     "evidence.metadata.privateObjectVerified!==true",
     'evidence.metadata.verificationOutcome!=="approved"',
     'evidence.metadata.verifiedBirthDate!==data.verifiedBirthDate',
     'eq(accountPersonGrants.role,"app_admin")',
     'evidence.subjectId!==account.personId',
   ])expect(review).toContain(required);
   expect(review).not.toContain('data.evidenceReference.startsWith("https:")');
 });
 it("reuses the verified public Person for ordinary noncredit enrollment",()=>{
   const source=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
   expect(source).toContain("canonicalPersonId:owner.personId");
   expect(source).toContain("link.canonicalPersonId!==owner.personId");
   expect(source).toContain("currentPerson?.active");
   expect(source).not.toContain("tx.insert(canonicalPersons)");
 });
 it("does not interrupt Course enrollment while an existing Person awaits Class age activation",()=>{
   const noncredit=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
   const auth=read("src/modules/identity/canonical-command-context.server.ts");
   expect(noncredit).toContain("A newly approved but unconsumed review must not interrupt");
   expect(noncredit).toContain("adultReview.consumedAt");
   expect(noncredit).toContain("adultReview.canonicalAccountId!==null");
   expect(auth).toContain("adultReview.consumedAt");
   expect(auth).toContain("adultReview.canonicalAccountId!==null");
   expect(auth).toContain('adultReview.status!=="approved"');
 });
 it("keeps cookie recovery on separate browser RPCs",()=>{
   const flow=read("src/modules/classes/native-class-entry.ts");
   expect(flow).toContain("Each createServerFn call is its own HTTP round trip");
   expect(flow).toContain("return await enrollInNativeClass(input)");
   expect(flow).toContain("await resumeLinkedNativeClassLearner()");
   expect(flow).toContain("await activateReviewedNativeClassLearner()");
   expect(flow).toContain("return enrollInNativeClass(input)");
   expect(read("src/routes/class.tsx")).toContain("enrollCurrentPersonInClass");
   const missing=normalizeClientError(new DomainError("CANONICAL_LEARNER_SESSION_REQUIRED"));
   expect(missing.kind).toBe("authentication");
   expect(missing.retryable).toBe(false);
 });
 it("does not clobber CAN login cookies during native cookie issuance",()=>{
   for(const path of [
     "src/modules/classes/native-class-session-recovery.functions.ts",
     "src/modules/classes/native-class-reviewed-onboarding.functions.ts",
     "src/modules/enrollment/noncredit-self-enrollment.functions.ts",
   ]){
     const src=read(path);
     expect(src).toContain('appendResponseHeader("Set-Cookie",');
     expect(src).not.toContain('setResponseHeader("Set-Cookie",');
   }
 });
 it("rechecks live adult evidence and reviewer revocation for native bearer sessions",()=>{
   const evidence=read("src/modules/identity/reviewed-learning-evidence.server.ts");
   const reader=read("src/modules/identity/canonical-command-context.server.ts");
   expect(evidence).toContain('review.status!=="approved"');
   expect(evidence).toContain("source.metadata.revokedAt!=null");
   expect(evidence).toContain("source.metadata.privateObjectVerified!==true");
   expect(evidence).toContain("source.expiresAt!==null&&source.expiresAt<=now");
   expect(evidence).toContain("review.accessPersonId!==canonicalPersonId");
   expect(evidence).toContain("source.metadata.verifiedBirthDate!==review.verifiedBirthDate");
   expect(evidence).toContain("current independently authorized adult reviewer");
   expect(evidence).toContain("current independent identity evidence verifier");
   expect(evidence).not.toContain("canonicalPersons");
   expect(reader).toContain("await assertCurrentReviewedNativeLearner(native.account_id,native.person_id)");
 });
 it("keeps review statuses redacted in platform operational reconciliation",()=>{
   const overview=read("src/modules/identity/platform-admin.functions.ts");
   expect(overview).toContain("reviewCases:reviewCases.map");
   expect(overview).not.toContain("verifiedBirthDate:accessAdultLearningReviews.verifiedBirthDate");
   expect(overview).not.toContain("evidenceReference:accessAdultLearningReviews.evidenceReference");
 });
});
