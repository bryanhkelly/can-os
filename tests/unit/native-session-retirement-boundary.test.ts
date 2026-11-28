import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("transitional native credential write authority",()=>{
 const root="src/modules/";
 it("locks current CAN session before provisioning or minting a native credential",()=>{
  for(const path of [
   "classes/native-class-session-recovery.server.ts",
   "classes/native-class-reviewed-onboarding.server.ts",
   "enrollment/noncredit-self-registration.server.ts",
   "enrollment/noncredit-self-enrollment-resume.functions.ts",
  ]){
   const s=read(root+path);
   expect(s).toContain("assertVerifiedAdultSessionForMutation(tx,request,owner)");
   const guard=s.indexOf("await assertVerifiedAdultSessionForMutation(tx,request,owner)");
   expect(guard).toBeGreaterThan(s.indexOf("db.transaction(async tx=>{"));
   expect(guard).toBeLessThan(s.indexOf("await issueNativeLearnerSession(tx,request,owner,"));
  }
  const issuer=read(root+"enrollment/noncredit-participant-identity.server.ts");
  const issue=issuer.slice(issuer.indexOf("export async function issueNativeLearnerSession"));
  expect(issue.indexOf("await assertVerifiedAdultSessionForMutation")).toBeLessThan(issue.indexOf("tx.insert(canonicalSessions)"));
  for(const proof of ["eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)","eq(accessAccountNoncreditPrincipals.accessPersonId,owner.personId)","eq(canonicalAccountGrants.personId,owner.personId)",'eq(canonicalAccountGrants.roleCode,"learner")',"isNull(canonicalAccountGrants.revokedAt)",'.for("share")'])expect(issue).toContain(proof);
 });
 it("revokes both exact digests and audits in the same transaction",()=>{
  const s=read(root+"identity/passwordless-access.server.ts"),body=s.slice(s.indexOf("export async function revokePresentedAccessSessions"),s.indexOf("/** Selection is restricted"));
  expect(body).toContain("readCookie(request,accessSessionCookie)");
  expect(body).toContain("readCookie(request,canonicalSessionCookie)");
  expect(body.indexOf("readCookie(request,canonicalSessionCookie)")).toBeLessThan(body.indexOf("db.transaction"));
  expect(body).toContain("eq(accessSessions.secretHash,canDigest)");
  expect(body).toContain("revokeAccessSessionInTransaction(tx,session.id,session.accountId)");
  expect(body).toContain("eq(canonicalSessions.secretHash,nativeDigest)");
  expect(body).toContain("identity.native_session.revoked");
  expect(body).toContain("actorPersonId:null");
 });
});
