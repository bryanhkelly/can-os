import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const activation=read("src/modules/classes/native-class-reviewed-onboarding.server.ts");
const transport=read("src/modules/classes/native-class-reviewed-onboarding.functions.ts");
const migration=read("database/canonical/v3.0.1/patch-reviewed-adult-class-onboarding.sql");
const route=read("src/routes/class.tsx");
const entry=read("src/modules/classes/native-class-entry.ts");

describe("reviewed adult Class activation: one sign-in, never self-verification",()=>{
  it("consumes only independent pre-existing approved evidence for exact CAN Person",()=>{
    for(const condition of [
      'resolveVerifiedAdultAccount(request)',
      'probeCanonicalAuthReader()',
      'review.status!=="approved"',
      'review.accessPersonId!==owner.personId',
      'review.reviewedByAccountId===owner.accountId',
      'verifiedAdultOn(review.verifiedBirthDate,now)',
      'reviewer?.verified',
      'reviewer.disabled',
      'eq(canonicalEnrollmentOrganizations.status,"active")',
    ])expect(activation).toContain(condition);
    expect(activation).not.toContain('validator(');
    expect(activation).not.toContain('data.birthDate');
  });
  it("cannot claim an existing canonical account by email or reuse an operator identity",()=>{
    expect(activation).toContain("accessAccountCanonicalPrincipals");
    expect(activation).toContain('if(operator||linked&&(linked.accessPersonId!==owner.personId||linked.personId!==owner.personId))');
    expect(activation).toContain('if(Boolean(sameEmail)!==Boolean(linked)');
    expect(activation).toContain('assertUnambiguousAdultAccount(owner.accountId,owner.personId,tx)');
    expect(activation).toContain('can.personId!==owner.personId');
  });
  it("reuses the authoritative Person and provisions only a native account and learner grant inside one audited transaction",()=>{
    expect(activation).toContain('db.transaction(async tx=>');
    expect(activation).toContain('pg_advisory_xact_lock(hashtext(');
    expect(activation).toContain('tx.insert(canonicalAccounts)');
    expect(activation).not.toContain('tx.insert(canonicalPersons)');
    expect(activation).toContain('nativePersonId=owner.personId');
    expect(activation).toContain('canonicalPersonId:owner.personId');
    expect(activation).toContain('assertCurrentAdultReviewEvidence(tx,review,now)');
    const evidence=read('src/modules/identity/reviewed-learning-evidence.server.ts');
    expect(evidence).toContain('source.metadata.verifiedBirthDate!==review.verifiedBirthDate');
    expect(evidence).toContain('current authoritative reviewed Person');
    expect(activation).toContain('existingPersonReused:Boolean(linked)');
    expect(activation).toContain('tx.insert(accessAccountNoncreditPrincipals)');
    expect(activation).toContain('tx.insert(canonicalAccountGrants)');
    expect(activation).toContain('roleCode:"learner"');
    expect(activation).toContain('siteId:null');
    expect(activation).toContain('isNull(accessAdultLearningReviews.consumedAt)');
    expect(activation).toContain('.returning({accessAccountId:accessAdultLearningReviews.accessAccountId})');
    expect(activation).toContain('if(!consumed)');
    expect(activation).toContain('eventCode:"class.learner.identity.activated"');
    expect(activation).toContain('issueNativeLearnerSession(tx,request,owner,nativeAccountId,grantId,now)');
    expect(activation.indexOf('assertVerifiedAdultSessionForMutation(tx,request,owner)')).toBeLessThan(activation.indexOf('tx.insert(canonicalAccounts)'));
    expect(transport.indexOf('appendResponseHeader("Set-Cookie",cookie)')).toBeGreaterThan(transport.indexOf('await activateReviewedNativeClassLearnerService(getRequest())'));
  });
  it("restricts evidence mutation and requires a different reviewer",()=>{
    expect(migration).toContain('adult_learning_independent_reviewer');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('freeze_adult_learning_review');
    expect(migration).toContain('OLD.status=\'revoked\'');
    expect(migration).toContain('Only trusted database operations');
  });
  it("can run the single-login QA gate without the separate four-session pilot fixtures",()=>{
    const preflight=read("scripts/acceptance/check-ws00-qa-readiness.mjs");
    const config=read("playwright.ws00-single-login.config.ts");
    expect(config).toContain('CAN_WS00_QA_SCOPE:"single_login_class"');
    expect(preflight).toContain('env.CAN_WS00_QA_SCOPE==="single_login_class"');
    expect(preflight).toContain("const ids=singleLoginOnly");
    expect(preflight).toContain('if(!singleLoginOnly){');
    expect(preflight).toContain("CAN_WS00_QA_FRESH_LEARNER_CAN_ACCOUNT_ID");
    expect(preflight).toContain("reviewSchema");
  });
  it("enrolls only after missing-cookie recovery and approved activation",()=>{
    expect(entry).toContain('CANONICAL_LEARNER_SESSION_REQUIRED');
    expect(entry).toContain('CANONICAL_LEARNER_ONBOARDING_REQUIRED');
    expect(entry).toContain('activateReviewedNativeClassLearner()');
    expect(route).toContain('<OfferingCard');
    expect(read('src/components/learning/native-class/OfferingCard.tsx')).toContain('enrollCurrentPersonInClass');
    const activationOffset=entry.indexOf('await activateReviewedNativeClassLearner()');
    expect(entry.indexOf('return enrollInNativeClass(input);',activationOffset))
      .toBeGreaterThan(activationOffset);
  });
});
