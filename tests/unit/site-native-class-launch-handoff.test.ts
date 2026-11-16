import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolveSiteClassLink} from "@/domain/site-class-launch-handoff";
const id="00000000-0000-4000-8000-000000000001";
const source=(path:string)=>readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
describe("Site-first native-Class handoff",()=>{
 it("does not expose native Classes from pending, revoked or malformed links",()=>{
  expect(resolveSiteClassLink(null)).toEqual({kind:"unlinked"});
  expect(resolveSiteClassLink({status:"pending",canonicalSiteId:id})).toEqual({kind:"pending"});
  expect(resolveSiteClassLink({status:"revoked",canonicalSiteId:id})).toEqual({kind:"blocked"});
  expect(resolveSiteClassLink({status:"approved",canonicalSiteId:"legacy"})).toEqual({kind:"blocked"});
  expect(resolveSiteClassLink({status:"approved",canonicalSiteId:id}))
   .toEqual({kind:"approved",canonicalSiteId:id});
 });
 it("requires independently authenticated native reads and exact Site filtering",()=>{
  const panel=source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
  expect(panel).toContain('enabled:Boolean(canonicalSiteId)');
  expect(panel).toContain("item.siteId===canonicalSiteId");
  expect(panel).toContain("getMyUnifiedClassDrafts");
  expect(panel).toContain('tab:"sessions"');
  expect(panel).toContain("Assign a Class facilitator");
  expect(panel).toContain("Review Sessions");
  expect(panel).not.toContain("Schedule and run Sessions");
 });
 it("preselects only native Site-authorized Course options",()=>{
  const route=source("src/routes/canonical.classes.tsx");
  expect(route).toContain('siteId:z.string().uuid().optional()');
  expect(route).toContain('row.siteOptions.some(site=>site.id===preferredSiteId)');
  expect(route).toContain("createUnifiedClassDraft({data:");
  expect(route).toContain('<NativeClasses key={siteId??"all"}/>');
 });
});
