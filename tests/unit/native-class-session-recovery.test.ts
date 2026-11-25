import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/domain/errors";
import { normalizeClientError } from "../../src/lib/client-error";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("existing CAN-only adult canonical learner session recovery",()=>{
  const path="src/modules/classes/native-class-session-recovery.functions.ts";
  it("requires an independent active verified CAN account and Person correspondence",()=>{
    const source=read(path);
    expect(source).toContain("requireVerifiedAdultAccount()");
    expect(source).toContain("probeCanonicalAuthReader()");
    expect(source).toContain('can.personId!==owner.personId');
    expect(source).toContain("assertUnambiguousAdultAccount(owner.accountId,owner.personId,tx)");
    expect(read("src/modules/identity/unambiguous-adult-account.server.ts")).toContain('grant.role === "student"');
    expect(source).toContain("links.length!==1");
    expect(source).toContain("link.accessPersonId");
    expect(source).toContain("accessAccountCanonicalPrincipals");
    expect(source).toContain("canonical staff identity requires separate authorization");
  });
  it("never invents a Person, birth date, enrollment or learner grant",()=>{
    const source=read(path);
    expect(source).toContain("verifiedAdultOn(native.birthDate,now)");
    expect(source).toContain('eq(canonicalAccountGrants.roleCode,"learner")');
    expect(source).toContain("isNull(canonicalAccountGrants.revokedAt)");
    expect(source).toContain("isNull(canonicalAccountGrants.siteId)");
    expect(source).toContain("grants.length===0");
    expect(source).toContain("grants.some(g=>g.personId!==link.canonicalPersonId)");
    expect(source).toContain("review?grants.filter(g=>g.organizationId===review.organizationId)");
    expect(source).toContain("home.length!==1");
    expect(source).not.toContain("tx.insert(canonicalAccounts)");
    expect(source).not.toContain("tx.insert(canonicalPersons)");
    expect(source).not.toContain("tx.insert(canonicalAccountGrants)");
    expect(source).not.toContain("tx.insert(canonicalClassEnrollments)");
  });
  it("does not let noncredit enrollment resurrect a revoked reviewed identity",()=>{
    const noncredit=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
    expect(noncredit).toContain("accessAdultLearningReviews");
    expect(noncredit).toContain('adultReview.status!=="approved"');
    expect(noncredit).toContain("adultReview.canonicalAccountId!==link.canonicalAccountId");
    expect(noncredit).toContain("person?.birthDate!==adultReview.verifiedBirthDate");
    expect(noncredit).toContain("to_regclass('public.access_adult_learning_reviews')");
    const recovery=read(path);
    expect(recovery).toContain('review.status!=="approved"');
    expect(recovery).toContain("review.verifiedBirthDate!==native.birthDate");
    expect(recovery).toContain("reviewedSchema.rows[0]?.forced!==true");
  });
  it("issues only after a serialized, audited transaction and proper restricted reader",()=>{
    const source=read(path);
    expect(source).toContain('pg_advisory_xact_lock(hashtext(');
    expect(source).toContain('eventCode:"class.learner.session.resumed"');
    expect(source).toContain("issueNativeLearnerSession(tx,native.accountId,grant.id,now)");
    expect(source.indexOf('appendResponseHeader("Set-Cookie",cookie)'))
      .toBeGreaterThan(source.indexOf("const {cookie}=await db.transaction"));
  });
  it("offers recoverable UX without claiming a new user's identity is already verified",()=>{
    const ui=read("src/routes/class.tsx");
    expect(read("src/modules/classes/native-class-entry.ts")).toContain("resumeLinkedNativeClassLearner()");
    expect(ui).toContain("Restore verified Class access");
    expect(ui).toContain("New learner identities and age");
    expect(ui).toContain("independent identity review");
  });
});


describe("native Class enrollment with one interactive CAN sign-in",()=>{
 const uiPath="src/routes/class.tsx";
 const commandPath="src/modules/classes/native-class-entry.ts";
 it("keeps recovery and enrollment in one reusable browser application flow",()=>{
   const service=read(commandPath);
   const first=service.indexOf("return await enrollInNativeClass(input);");
   const recovery=service.indexOf("await resumeLinkedNativeClassLearner();",first);
   const activation=service.indexOf("await activateReviewedNativeClassLearner();",recovery);
   const retry=service.indexOf("return enrollInNativeClass(input);",activation);
   expect(first).toBeGreaterThan(-1);
   expect(recovery).toBeGreaterThan(first);
   expect(activation).toBeGreaterThan(recovery);
   expect(retry).toBeGreaterThan(activation);
   expect(service).toContain('normalizeClientError(originalError).code!=="CANONICAL_LEARNER_SESSION_REQUIRED"');
   expect(service).toContain('normalizeClientError(recoveryError).code!=="CANONICAL_LEARNER_ONBOARDING_REQUIRED"');
 });
 it("keeps self, approval and invitation on the exact same service",()=>{
   const ui=read(uiPath);
   // File-route modules are included in SSR; importing a .client module here
   // is rejected by the TanStack Start server import-protection gate.
   for(const name of ["OfferingCard","ApprovedClassCard","InvitationCard"]){
     expect(ui).toContain("<"+name);
     const card=read("src/components/learning/native-class/"+name+".tsx");
     expect(card).toContain('from "@/modules/classes/native-class-entry"');
     expect(card).not.toContain("native-class-entry.client");
     expect(card.match(/enrollCurrentPersonInClass\(\{data:\{/g)??[]).toHaveLength(1);
   }
   expect(ui).not.toContain("async function enrollWithLinkedCanRecovery");
   expect(read(commandPath)).toContain("Each createServerFn call is its own HTTP round trip");
   const auth=read("src/modules/identity/canonical-command-context.server.ts");
   expect(auth).toContain('throw new DomainError("CANONICAL_LEARNER_SESSION_REQUIRED")');
   expect(auth).toContain('native.role_code !== "learner"');
 });
 it("never creates new Persons while recovering old native sessions",()=>{
   const recovery=read("src/modules/classes/native-class-session-recovery.functions.ts");
   expect(recovery).toContain("verifiedAdultOn(native.birthDate,now)");
   expect(recovery).toContain("links.length!==1");
   expect(recovery).toContain("grants.length===0");
   expect(recovery).not.toContain("tx.insert(canonicalPersons)");
   expect(recovery).not.toContain("tx.insert(canonicalAccounts)");
 });
});

describe("native learner session recovery error contract",()=>{
  it("distinguishes missing native cookie from forbidden permission",()=>{
    const missing=normalizeClientError(new DomainError("CANONICAL_LEARNER_SESSION_REQUIRED"));
    expect(missing.code).toBe("CANONICAL_LEARNER_SESSION_REQUIRED");
    expect(missing.kind).toBe("authentication");
    expect(normalizeClientError(new DomainError("FORBIDDEN")).code).toBe("FORBIDDEN");
    const onboarding=normalizeClientError(new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED"));
    expect(onboarding.code).toBe("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
    expect(onboarding.kind).toBe("authorization");
    expect(normalizeClientError(new DomainError("UNAVAILABLE")).code).toBe("UNAVAILABLE");
  });
});
