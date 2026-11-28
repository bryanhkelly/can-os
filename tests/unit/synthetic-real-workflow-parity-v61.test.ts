import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import { canResolveCanSiteStaff } from "@/domain/canonical-can-sso";
import { assertMembershipSwitchIdentity } from "@/domain/membership-switch-policy";
import { AuthorizationError } from "@/domain/command-context";

const source=(path:string)=>readFileSync(path,"utf8");

const grant:VerifiedAccessGrant={
 id:"grant", accountId:"account", personId:"person",
 organizationId:"org", siteId:"site", role:"room_facilitator",active:true,
};

describe("CAN V6.1 real/synthetic authorization parity",()=>{
 it("grants identical capabilities to equivalent real and synthetic identities",()=>{
  const synthetic=resolveAccessContext({accountId:"account",sessionId:"session",activeGrantId:"grant"},[grant]);
  const ordinary:VerifiedAccessGrant={...grant,id:"real-grant",accountId:"real-account",
    personId:"real-person",organizationId:"real-org",siteId:"real-site"};
  const real=resolveAccessContext({accountId:ordinary.accountId,sessionId:"other",activeGrantId:ordinary.id},[ordinary]);
  expect([...real.capabilities]).toEqual([...synthetic.capabilities]);
  expect([...real.capabilities]).toEqual(["learning.room.facilitate"]);
  for(const denied of ["onsite.attendance.record","onsite.pickup.release",
    "safeguarding.concern.submit","assignments:grade","class.manage"]){
    expect(synthetic.capabilities.has(denied)).toBe(false);
    expect(real.capabilities.has(denied)).toBe(false);
  }
 });
 it("ordinary multi-role membership is one Person, not a second CAN identity",()=>{
  const teacher:VerifiedAccessGrant={...grant,role:"teacher"};
  const second:VerifiedAccessGrant={...grant,id:"grant-two",role:"room_facilitator"};
  expect(assertMembershipSwitchIdentity({accountId:"account",accountPersonId:"person",
    targetGrantId:"grant-two",grants:[teacher,second],activePersonIds:["person"],
    demoAccountSwitching:false})).toEqual(second);
  expect(()=>assertMembershipSwitchIdentity({accountId:"account",accountPersonId:"person",
    targetGrantId:"grant-two",grants:[teacher,{...second,personId:"foreign"}],
    activePersonIds:["person","foreign"],demoAccountSwitching:false})).toThrow(AuthorizationError);
 });
 it("a direct session cannot select a different active Person even with the legacy flag",()=>{
  const other:VerifiedAccessGrant={...grant,id:"target",accountId:"target-account",personId:"target-person"};
  expect(()=>assertMembershipSwitchIdentity({accountId:"account",accountPersonId:"person",
    targetGrantId:"target",grants:[other],activePersonIds:["person"],
    demoAccountSwitching:false})).toThrow();
  expect(assertMembershipSwitchIdentity({accountId:"account",accountPersonId:"person",
    targetGrantId:"target",grants:[other],activePersonIds:[],
    demoAccountSwitching:true})).toThrow(AuthorizationError);
 });
 it("staff canonical authorization accepts the server-verified effective role",()=>{
  const actor={
    role:"room_facilitator",accountId:"account",actorPersonId:"person",
    grantSiteId:"site",scope:{organizationIds:["org"],siteIds:["site"]},
    capabilities:new Set(["learning.room.facilitate"]),
  };
  expect(canResolveCanSiteStaff(actor)).toBe(true);
  expect(canResolveCanSiteStaff({...actor,impersonatedByAccountId:"demo-owner"})).toBe(true);
  expect(canResolveCanSiteStaff({...actor,sessionAccountId:"unverified-client-owner"})).toBe(false);
 });
 it("assigns teaching and room facilitation through separate ordinary CAN grants",()=>{
  const staff=source("src/modules/classes/class-staff.functions.ts");
  expect(staff).toContain('data.roleCode==="teacher"?"teacher":"room_facilitator"');
  expect(staff).toContain('eq(accountPersonGrants.role,requiredRole)');
  expect(staff).toContain('if(data.roleCode==="teacher" && data.canVerifyAttendance)');
  expect(staff).toContain("exact Class Site");
  expect(staff).not.toContain('eq(accountPersonGrants.role,"room_facilitator")');
  expect(staff).not.toContain("LOCAL_DEMO_RILEY_FACILITATOR");
 });
 it("domain services contain no Riley-specific or Valor-specific grant permission exceptions",()=>{
  for(const file of [
    "src/domain/access-context.ts",
    "src/modules/classes/class-staff.functions.ts",
    "src/modules/classes/native-class-room-boundary.server.ts",
    "src/modules/classes/native-class-session-host.server.ts",
    "src/modules/identity/current-can-grant-transaction.server.ts",
  ]){
    const code=source(file);
    expect(code,file).not.toContain("LOCAL_DEMO_RILEY_FACILITATOR");
    expect(code,file).not.toContain("riley.teacher@valorschool.demo");
    expect(code,file).not.toContain("isDemoAccountEmail");
  }
  const sql=source("database/production/2026-11-20-can-staff-auth-parity-and-demo-delegation.sql");
  expect(sql).toContain("g.account_id=session_owner.id");
  expect(sql).toContain("admin_grant.account_id=session_owner.id");
  expect(sql).not.toContain("riley.teacher@valorschool.demo");
  expect(sql).not.toContain("person.metadata");
 });
 it("protects the real session owner and preserves impersonation audit provenance",()=>{
  const session=source("src/modules/identity/command-context.server.ts");
  const audit=source("src/platform/mutation.ts");
  const canonicalAudit=source("src/platform/canonical-mutation.server.ts");
  const logout=source("src/routes/access.logout.ts");
  expect(session).toContain("context.impersonatedByAccountId=session.accountId");
  expect(session).not.toContain("demoAccountSwitching");
  expect(audit).toContain("session.impersonatedByAccountId");
  expect(canonicalAudit).toContain("sessionAccountId: actor.impersonatedByAccountId");
  expect(logout).toContain("impersonatedByAccountId??sessionAccountId??accountId");
 });
});
