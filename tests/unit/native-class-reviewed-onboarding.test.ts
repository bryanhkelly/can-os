import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const activation=read("src/modules/classes/native-class-reviewed-onboarding.functions.ts");
const migration=read("database/canonical/v3.0.1/patch-reviewed-adult-class-onboarding.sql");
const route=read("src/routes/class.tsx");

describe("reviewed adult Class activation: one sign-in, never self-verification",()=>{
  it("consumes only independent pre-existing approved evidence for exact CAN Person",()=>{
    for(const condition of [
      'requireVerifiedAdultAccount()',
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
    expect(activation).toContain('if(operator||linked)');
    expect(activation).toContain('if(sameEmail)');
    expect(activation).toContain('row.role==="student"');
    expect(activation).toContain('can.personId!==owner.personId');
  });
  it("provisions one native Person and one learner grant inside one audited transaction",()=>{
    expect(activation).toContain('db.transaction(async tx=>');
    expect(activation).toContain('pg_advisory_xact_lock(hashtext(');
    expect(activation).toContain('tx.insert(canonicalAccounts)');
    expect(activation).toContain('tx.insert(canonicalPersons)');
    expect(activation).toContain('birthDate:review.verifiedBirthDate');
    expect(activation).toContain('tx.insert(accessAccountNoncreditPrincipals)');
    expect(activation).toContain('tx.insert(canonicalAccountGrants)');
    expect(activation).toContain('roleCode:"learner"');
    expect(activation).toContain('siteId:null');
    expect(activation).toContain('isNull(accessAdultLearningReviews.consumedAt)');
    expect(activation).toContain('.returning({accessAccountId:accessAdultLearningReviews.accessAccountId})');
    expect(activation).toContain('if(!consumed)');
    expect(activation).toContain('eventCode:"class.learner.identity.activated"');
    expect(activation).toContain('issueNativeLearnerSession(tx,nativeAccount.id,grant.id,now)');
    expect(activation.indexOf('setResponseHeader("Set-Cookie",result.cookie)'))
      .toBeGreaterThan(activation.indexOf('db.transaction(async tx=>'));
  });
  it("restricts evidence mutation and requires a different reviewer",()=>{
    expect(migration).toContain('adult_learning_independent_reviewer');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('freeze_adult_learning_review');
    expect(migration).toContain('OLD.status=\'revoked\'');
    expect(migration).toContain('Only trusted database operations');
  });
  it("enrolls only after missing-cookie recovery and approved activation",()=>{
    expect(route).toContain('CANONICAL_LEARNER_SESSION_REQUIRED');
    expect(route).toContain('CANONICAL_LEARNER_ONBOARDING_REQUIRED');
    expect(route).toContain('activateReviewedNativeClassLearner()');
    const activationOffset=route.indexOf('await activateReviewedNativeClassLearner()');
    expect(route.indexOf('return enrollInNativeClass(data);',activationOffset))
      .toBeGreaterThan(activationOffset);
  });
});
