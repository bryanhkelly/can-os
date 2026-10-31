import {describe,expect,it} from "vitest";
import {launchWebsiteHandoffGrant} from "../../src/domain/launch-website-handoff";
const registrar={id:"registrar",personId:"person",role:"registrar",siteId:"site",organizationId:"org"};
const editor={...registrar,id:"editor",role:"site_website_editor"};
describe("school launch to church website editor handoff",()=>{
 it("selects an existing same-person editor at the exact school Site",()=>{
  expect(launchWebsiteHandoffGrant([registrar,editor],{activeGrantId:"registrar",siteId:"site",destination:"editor"})).toEqual(editor);
 });
 it.each([{siteId:"other"},{personId:"other"},{organizationId:"other"},{role:"guardian"}])("does not substitute another Site, person or role",change=>{
  expect(launchWebsiteHandoffGrant([registrar,{...editor,...change}],{activeGrantId:"registrar",siteId:"site",destination:"editor"})).toBeNull();
 });
 it("returns to the original same-person school setup membership",()=>{
  expect(launchWebsiteHandoffGrant([registrar,editor],{activeGrantId:"editor",siteId:"site",destination:"launch",returnGrantId:"registrar"})).toEqual(registrar);
 });
 it("supports an original organization-wide registrar without broadening the editor Site",()=>{
  const organizationRegistrar={...registrar,siteId:null};
  expect(launchWebsiteHandoffGrant([organizationRegistrar,editor],{activeGrantId:"editor",siteId:"site",destination:"launch",returnGrantId:"registrar"})).toEqual(organizationRegistrar);
 });
 it("does not honor a return identifier for another person",()=>{
  expect(launchWebsiteHandoffGrant([{...registrar,personId:"other"},editor],{activeGrantId:"editor",siteId:"site",destination:"launch",returnGrantId:"registrar"})).toBeNull();
 });
 it("requires resolution instead of picking an ambiguous editor membership",()=>{
  expect(launchWebsiteHandoffGrant([registrar,editor,{...editor,id:"duplicate"}],{activeGrantId:"registrar",siteId:"site",destination:"editor"})).toBeNull();
 });
});
