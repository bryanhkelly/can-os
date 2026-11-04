import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
vi.mock("@tanstack/react-router",()=>({Link:({children,to,params}:any)=>React.createElement("a",{href:params?to.replace("$siteId",params.siteId):to},children)}));
import {SchoolPreparationNavigation} from "../../src/components/operations/SchoolPreparationNavigation";
const school={id:"program",name:"Hope School",siteId:"site",siteName:"Hope Church",status:"active"};
describe("school preparation after launch activation",()=>{
 it("keeps the active school's preparation and real operating handoff visible",()=>{
  const html=renderToStaticMarkup(<SchoolPreparationNavigation schools={[school]} selected={school} onSelect={()=>{}}/>);
  expect(html).toContain("Hope School · operating workspace available");expect(html).toContain("family invitations and school-year planning remain available");
  expect(html).toContain('href="/home"');expect(html).toContain("Review saved academic year");
  expect(html).toContain("Active Program status alone does not certify");
 });
 it("requires an explicit school choice when no school is selected",()=>{
  const html=renderToStaticMarkup(<SchoolPreparationNavigation schools={[school,{...school,id:"other",name:"Another School"}]} selected={null} onSelect={()=>{}}/>);
  expect(html).toContain("Choose your school");expect(html).toContain("Another School");expect(html).not.toContain("Open Site Today");
 });
});
