import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import {
  assertOnsiteAttendanceScope, isOnsiteAttendanceRole, onsiteAttendanceRoles,
} from "@/domain/onsite-attendance-access";

const base: VerifiedAccessGrant = {
  id:"grant",accountId:"account",personId:"onsite-adult",role:"room_facilitator",
  organizationId:"org-1",siteId:"site-a",active:true,
};
const session = {accountId:"account",sessionId:"login",activeGrantId:"grant"};

describe("Hybrid Site onsite staff attendance authority",()=>{
  it.each(onsiteAttendanceRoles)("%s has site roster/attendance but not registrar/case powers",role=>{
    const actor=resolveAccessContext(session,[{...base,role}]);
    actor.scope.programIds=["program-a"];
    expect(() => assertOnsiteAttendanceScope(actor,"site-a")).not.toThrow();
    for (const forbidden of ["attendance.write","attendance.excuse.review",
      "student:read","enrollment:manage","assignments:grade","incident.read",
      "referrals:read","support-plans:manage","action.resolve"]) {
      expect(actor.capabilities.has(forbidden)).toBe(false);
    }
  });
  it("rejects wrong site even when an expanded scope lists a sibling site",()=>{
    const actor=resolveAccessContext(session,[base]);
    actor.scope.programIds=["program-a"];
    actor.scope.siteIds=["site-a","site-b"];
    expect(() => assertOnsiteAttendanceScope(actor,"site-b")).toThrow("site-bound");
  });
  it("denies organization-wide grants, missing program scope, inactive grant and paraeducator",()=>{
    const actor=resolveAccessContext(session,[base]);
    actor.scope.programIds=["program-a"];
    expect(isOnsiteAttendanceRole("paraeducator")).toBe(false);
    expect(() => assertOnsiteAttendanceScope(
      {...actor,grantSiteId:null},"site-a")).toThrow();
    expect(() => assertOnsiteAttendanceScope(
      {...actor,scope:{...actor.scope,programIds:[]}},"site-a")).toThrow();
    const aide=resolveAccessContext(session,[{...base,role:"paraeducator"}]);
    aide.scope.programIds=["program-a"];
    expect(() => assertOnsiteAttendanceScope(aide,"site-a")).toThrow();
    expect(()=>resolveAccessContext(session,[{...base,active:false}])).toThrow();
  });
});
