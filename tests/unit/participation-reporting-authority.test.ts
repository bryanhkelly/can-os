import {describe,expect,it} from "vitest";
import {assertExactClassReportingScope} from "@/domain/participation-reporting-authority";
import type {CommandContext} from "@/domain/command-context";
const valid:CommandContext={
  actorPersonId:"operator",role:"site_admin",
  capabilities:new Set(["class.manage"]),
  scope:{organizationIds:["org-one"],siteIds:["site-one"]},
};
const cls={operatingOrganizationId:"org-one",siteId:"site-one"};
describe("WS6 Class report principal isolation",()=>{
 it("permits only a current exact provider operator scope",()=>{
  expect(()=>assertExactClassReportingScope(valid,cls)).not.toThrow();
 });
 it("denies another Site, including one in the same Organization",()=>{
  expect(()=>assertExactClassReportingScope(valid,{...cls,siteId:"site-two"})).toThrow();
 });
 it("denies another operating Organization despite matching Site",()=>{
  expect(()=>assertExactClassReportingScope(valid,{...cls,operatingOrganizationId:"org-two"})).toThrow();
 });
 it("denies a network-wide role unless it has independently verified operator grants",()=>{
  const affiliate={...valid,role:"network_admin"};
  expect(()=>assertExactClassReportingScope(affiliate,cls)).toThrow();
 });
 it("denies teaching-only access, staff-role mismatch and absent capability",()=>{
  const teacher={...valid,role:"room_facilitator"};
  const noCapability={...valid,capabilities:new Set<string>()};
  expect(()=>assertExactClassReportingScope(teacher,cls)).toThrow();
  expect(()=>assertExactClassReportingScope(noCapability,cls)).toThrow();
 });
 it("denies revoked Site and operating grants represented by removal from current scope",()=>{
  expect(()=>assertExactClassReportingScope({...valid,scope:{organizationIds:["org-one"],siteIds:[]}},cls)).toThrow();
  expect(()=>assertExactClassReportingScope({...valid,scope:{organizationIds:[],siteIds:["site-one"]}},cls)).toThrow();
 });
 it("denies ambiguous multi-organization sessions or site-less delivery",()=>{
  expect(()=>assertExactClassReportingScope({...valid,scope:{organizationIds:["org-one","org-two"],siteIds:["site-one"]}},cls)).toThrow();
  expect(()=>assertExactClassReportingScope(valid,{...cls,siteId:null})).toThrow();
 });
 it("requires an actual authenticated Person",()=>{
  expect(()=>assertExactClassReportingScope({...valid,actorPersonId:null},cls)).toThrow();
 });
});
