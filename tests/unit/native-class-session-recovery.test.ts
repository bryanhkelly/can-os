import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("existing CAN-only adult canonical learner session recovery",()=>{
  const path="src/modules/classes/native-class-session-recovery.functions.ts";
  it("requires an independent active verified CAN account and Person correspondence",()=>{
    const source=read(path);
    expect(source).toContain("requireVerifiedAdultAccount()");
    expect(source).toContain("probeCanonicalAuthReader()");
    expect(source).toContain('can.personId!==owner.personId');
    expect(source).toContain("memberships.some(");
    expect(source).toContain('grant.role==="student"');
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
    expect(source).toContain("grants.length!==1");
    expect(source).not.toContain("tx.insert(canonicalAccounts)");
    expect(source).not.toContain("tx.insert(canonicalPersons)");
    expect(source).not.toContain("tx.insert(canonicalAccountGrants)");
    expect(source).not.toContain("tx.insert(canonicalClassEnrollments)");
  });
  it("issues only after a serialized, audited transaction and proper restricted reader",()=>{
    const source=read(path);
    expect(source).toContain('pg_advisory_xact_lock(hashtext(');
    expect(source).toContain('eventCode:"class.learner.session.resumed"');
    expect(source).toContain("issueNativeLearnerSession(tx,native.accountId,grant.id,now)");
    expect(source.indexOf('setResponseHeader("Set-Cookie",cookie)'))
      .toBeGreaterThan(source.indexOf("const {cookie}=await db.transaction"));
  });
  it("offers recoverable UX without claiming a new user's identity is already verified",()=>{
    const ui=read("src/routes/class.tsx");
    expect(ui).toContain("resumeLinkedNativeClassLearner()");
    expect(ui).toContain("Restore verified Class access");
    expect(ui).toContain("New learner identities and age");
    expect(ui).toContain("independent identity review");
  });
});
