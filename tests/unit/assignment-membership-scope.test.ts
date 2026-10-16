import {describe,expect,it} from "vitest";
import {assertSiteScope,AuthorizationError,type CommandContext} from "@/domain/command-context";
import {resolveAccessContext,type VerifiedAccessGrant} from "@/domain/access-context";

const grant:VerifiedAccessGrant={
 id:"grant-a",accountId:"account-a",personId:"person-a",role:"teacher",
 organizationId:"org-a",siteId:"site-a",active:true
};
describe("site-scoped assignment authorization",()=>{
 it("allows only the site granted by verified membership",()=>{
  const ctx=resolveAccessContext({accountId:"account-a",sessionId:"session-a",activeGrantId:"grant-a"},[grant]);
  expect(()=>assertSiteScope(ctx,"site-a")).not.toThrow();
  expect(()=>assertSiteScope(ctx,"site-b")).toThrow(AuthorizationError);
 });
 it("rejects selecting a membership belonging to another account",()=>{
  expect(()=>resolveAccessContext({accountId:"account-b",sessionId:"session-b",activeGrantId:"grant-a"},[grant])).toThrow(AuthorizationError);
 });
 it("treats explicitly empty allowed site lists as deny-all",()=>{
  const ctx:CommandContext={actorPersonId:"person-a",capabilities:new Set(),scope:{siteIds:[]}};
  expect(()=>assertSiteScope(ctx,"site-a")).toThrow(AuthorizationError);
 });
});