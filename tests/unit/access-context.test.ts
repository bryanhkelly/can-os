import {describe,it,expect} from "vitest";
import {assertGrantSelection,resolveAccessContext,type VerifiedAccessGrant} from "@/domain/access-context";
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