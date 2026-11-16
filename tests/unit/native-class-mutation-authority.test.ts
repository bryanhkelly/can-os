import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalRoleCapabilities } from "@/domain/canonical-access";

const read=(path:string)=>readFileSync(path,"utf8");
const occurrences=(source:string,value:string)=>source.split(value).length-1;

describe("native Class writes use current single-login authority",()=>{
  it("retains scoped Class operator permission without restoring automatic credential issuance",()=>{
    for(const role of ["site_admin","registrar"] as const){
      expect(canonicalRoleCapabilities[role]).toContain("class.manage");
      expect(canonicalRoleCapabilities[role]).not.toContain("credential.issue");
    }
    expect(canonicalRoleCapabilities.room_facilitator).not.toContain("class.manage");
    expect(canonicalRoleCapabilities.learner).not.toContain("class.manage");
  });
  it("revalidates the active Site staff session inside all five Class identity/publication mutations",()=>{
    const source=read("src/modules/classes/unified-class.functions.ts");
    expect(occurrences(source,"await assertCurrentCanonicalStaffForMutation(tx,getRequest(),operator.actor)")).toBe(5);
    for(const name of ["createUnifiedClassDraft","activateUnifiedClass","publishUnifiedClassOffering",
      "closeUnifiedClassOffering","createNextUnifiedClassOfferingVersion"]){
      expect(source).toContain("export const "+name+"=");
    }
  });
  it("revalidates sensitive staff assignment and direct enrollment writes",()=>{
    const staff=read("src/modules/classes/class-staff.functions.ts");
    const enrollment=read("src/modules/classes/native-class-assignment.functions.ts");
    expect(occurrences(staff,"await assertCurrentCanonicalStaffForMutation(tx,getRequest(),manager.actor)")).toBe(2);
    expect(occurrences(enrollment,"await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)")).toBe(1);
    expect(enrollment).toContain("isNull(canonicalAccountGrants.siteId)");
  });
  it("requires a verified current facilitator bearer session in BOTH schedule and room opening commands",()=>{
    const sessions=read("src/modules/classes/native-class-sessions.functions.ts");
    const auth=read("src/modules/classes/native-class-facilitator-session.server.ts");
    expect(occurrences(sessions,"await assertCurrentNativeClassFacilitatorSession(tx,host.actor)")).toBe(2);
    expect(auth).toContain("v301_canonical_session_context");
    expect(auth).toContain("assertCurrentCanonicalStaffForMutation");
    expect(auth).toContain("canonicalSessionDigestFromRequest");
    expect(auth).toContain('row.role_code!=="room_facilitator"');
    expect(auth).toContain("unchanged exact current Class facilitator");
  });
});
