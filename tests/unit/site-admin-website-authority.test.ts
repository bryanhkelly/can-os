import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { roleCapabilities } from "@/domain/access-context";
vi.mock("@/db/client",()=>({db:{select:vi.fn()}}));
import { requirePartnerWebsiteEditor } from "@/modules/sites/site-website-authorization.server";
const actor:AccessContext={accountId:"account",sessionId:"session",grantId:"grant",grantSiteId:"site",actorPersonId:"person",role:"site_admin",capabilities:new Set(roleCapabilities.site_admin),scope:{organizationIds:["org"],siteIds:["site"]}};
const site={id:"site",slug:"school",organizationId:"org",name:"School",organizationName:"School",organizationType:"christian_school",parentOrganizationId:null};
function reader(rows:unknown[][]){return {select:vi.fn(()=>{const result=rows.shift()??[];const chain:any={from:()=>chain,innerJoin:()=>chain,where:()=>chain,limit:async()=>result};return chain;})};}
describe("unaffiliated Site Administrator website authority",()=>{
 it("uses its verified Site Admin grant without an editor appointment",async()=>{
  const db=reader([[site],[{id:"grant"}],[]]);
  await expect(requirePartnerWebsiteEditor(actor,db as any,"site.website.local.publish")).resolves.toMatchObject({id:"site",canPublish:true});
  expect(db.select).toHaveBeenCalledTimes(3);
 });
 it.each(["membership","affiliation","parent","denomination"])("rejects missing or network-governed %s authority",async kind=>{
  const scoped={...site,...(kind==="parent"?{parentOrganizationId:"network"}:{}),...(kind==="denomination"?{organizationType:"denomination"}:{})};
  const db=reader([[scoped],kind==="membership"?[]:[{id:"grant"}],kind==="affiliation"?[{id:"affiliation"}]:[]]);
  await expect(requirePartnerWebsiteEditor(actor,db as any)).rejects.toThrow();
 });
 it.each(["site","organization","capability","role"])("denies mismatched %s context",async kind=>{
  const context={...actor,...(kind==="site"?{grantSiteId:"sibling"}:{}),...(kind==="organization"?{scope:{organizationIds:["foreign"],siteIds:["site"]}}:{}),...(kind==="capability"?{capabilities:new Set<string>()}:{}),...(kind==="role"?{role:"registrar"}:{})};
  await expect(requirePartnerWebsiteEditor(context,reader([[site]]) as any)).rejects.toThrow();
 });
 it("retains the delegated editor relationship and its explicit publishing capability",async()=>{
  const editor={...actor,role:"site_website_editor",capabilities:new Set(roleCapabilities.site_website_editor)};
  await expect(requirePartnerWebsiteEditor(editor,reader([[site],[{id:"assignment",capabilities:["site.website.local.publish"]}]]) as any)).resolves.toMatchObject({canPublish:true});
  await expect(requirePartnerWebsiteEditor(editor,reader([[site],[]]) as any)).rejects.toThrow("explicit Site website editor assignment");
 });
});

it("does not mistake an ordinary local parent organization for a denominational affiliation",async()=>{
 const db=reader([[{...site,parentOrganizationId:"local-church"}],[{id:"grant"}],[],[{type:"church",parentOrganizationId:null}]]);
 await expect(requirePartnerWebsiteEditor(actor,db as any)).resolves.toMatchObject({id:"site",canPublish:true});
});

it("recognizes network ownership through an ancestor organization",async()=>{
 const db=reader([[{...site,parentOrganizationId:"local-church"}],[{id:"grant"}],[],[{type:"church",parentOrganizationId:"denomination"}],[{type:"denomination",parentOrganizationId:null}]]);
 await expect(requirePartnerWebsiteEditor(actor,db as any)).rejects.toThrow("Network ownership");
});
