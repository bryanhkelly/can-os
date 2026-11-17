import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {assertGrantSelection,assertSingleAccountPerson,resolveAccessContext,roleCapabilities,type VerifiedAccessGrant} from "@/domain/access-context";
const grant:VerifiedAccessGrant={id:"grant-1",accountId:"account-1",personId:"person-1",role:"teacher",organizationId:"org-1",siteId:"site-1",active:true};
describe("provider-independent authorization context",()=>{
 it("derives the actor, capabilities and scope from verified grants",()=>{
  const ctx=resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},[grant]);
  expect(ctx.actorPersonId).toBe("person-1");
  expect(ctx.capabilities.has("assignments:grade")).toBe(true);
  expect(ctx.capabilities.has("admissions:decide")).toBe(false);
  expect(ctx.scope.siteIds).toEqual(["site-1"]);
  expect(ctx.grantSiteId).toBe("site-1");
 });
 it("limits the student self-profile capability to student membership",()=>{
  const context=resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},
   [{...grant,role:"student"}]);
  expect(context.capabilities.has("profiles.self_profile.manage")).toBe(true);
  expect(context.capabilities.has("profiles.credentials.verify")).toBe(false);
  expect(context.capabilities.has("admin.manage")).toBe(false);
 });
 it("preserves original organization-wide membership when its effective site list expands",()=>{
  const context=resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},
   [{...grant,role:"registrar",siteId:null}]);
  expect(context.grantSiteId).toBeNull();
  context.scope.siteIds=["site-1","site-2"];
  expect(context.grantSiteId).toBeNull();
 });
 it("grants HQ site administration without any student or admissions privileges",()=>{
  const context=resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},
   [{...grant,role:"network_admin",siteId:null}]);
  expect(context.role).toBe("network_admin");
  expect(context.grantSiteId).toBeNull();
  expect(context.capabilities.has("network.sites.manage")).toBe(true);
  for(const forbidden of ["admissions:read","enrollment.activate","assignments:grade","student:read","admin.manage","program.launch.start"]){
   expect(context.capabilities.has(forbidden)).toBe(false);
  }
 });
 it("limits instructional content roles to course-authoring and review capabilities",()=>{
  expect(roleCapabilities.academic_content_creator).toEqual(["instructional_track.author"]);
  expect(roleCapabilities.academic_content_reviewer).toEqual([
   "instructional_track.review","instructional_track.publish","instructional_track.withdraw",
  ]);
  for(const role of ["academic_content_creator","academic_content_reviewer"]){
   expect(roleCapabilities[role]).not.toContain("student:read");
   expect(roleCapabilities[role]).not.toContain("assignments:grade");
   expect(roleCapabilities[role]).not.toContain("enrollment:manage");
  }
 });
 it("checks all underlying active grants, not only filtered workspace grants",()=>{
  const server=readFileSync("src/modules/identity/command-context.server.ts","utf8");
  expect(server).toContain("from(accountPersonGrants)");
  expect(server).toContain("eq(accountPersonGrants.accountId,session.accountId)");
  expect(server).toContain("eq(accountPersonGrants.active,true)");
  expect(server).toContain("not(eq(accountPersonGrants.personId,activePerson))");
  expect(server).toContain("if(conflicting.length)");
  // A first-page or bounded lookup cannot prove the absence of a conflicting
  // grant in the account's full active grant set.
  expect(server).not.toContain("originalPersons.length===0");
 });
 it("requires exactly one Person per real account across Site and role grants",()=>{
  const own=[grant,{...grant,id:"grant-2",role:"guardian",siteId:"site-2"}];
  expect(()=>assertSingleAccountPerson("account-1",own)).not.toThrow();
  expect(()=>assertSingleAccountPerson("account-1",[
   grant,{...grant,id:"grant-2",personId:"person-2",role:"guardian"},
  ])).toThrow();
  expect(()=>assertSingleAccountPerson("account-1",[])).toThrow();
  expect(()=>assertSingleAccountPerson("account-1",[
   {...grant,active:false},
  ])).toThrow();
  expect(()=>assertSingleAccountPerson("account-2",[grant])).toThrow();
 });
 it("rejects an account trying to use another account's membership",()=>{
  expect(()=>resolveAccessContext({accountId:"account-2",sessionId:"session-2",activeGrantId:"grant-1"},[grant])).toThrow();
  expect(()=>assertGrantSelection("account-2","grant-1",[grant])).toThrow();
 });
 it("rejects unsupported and inactive roles even if linked to the account",()=>{
  expect(()=>assertGrantSelection("account-1","grant-1",[{...grant,role:"superadmin"}])).toThrow();
  expect(()=>assertGrantSelection("account-1","grant-1",[{...grant,role:"toString"}])).toThrow();
  expect(()=>resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},[{...grant,role:"toString"}])).toThrow();
 });
 it("rejects inactive or arbitrary role grants",()=>{
  expect(()=>assertGrantSelection("account-1","grant-1",[{...grant,active:false}])).toThrow();
  expect(()=>resolveAccessContext({accountId:"account-1",sessionId:"session-1",activeGrantId:"grant-1"},[{...grant,role:"superadmin"}])).toThrow();
 });
});