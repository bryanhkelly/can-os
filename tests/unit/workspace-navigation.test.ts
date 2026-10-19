import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {SidebarLinks,workspaceHome,workspaceLinks} from "@/components/shell/WorkspaceNavigation";

describe("canonical workspace navigation",()=>{
 it("has a landing page for each recognized member role",()=>{
  for(const role of ["student","teacher","guardian","registrar","specialist","counselor"]){
   expect(workspaceHome[role]).toMatch(/^\//);
   expect(workspaceLinks[role].some(item=>item.path===workspaceHome[role])).toBe(true);
  }
 });
 it("does not expose another role's navigation destinations",()=>{
  const paths=(role:string)=>workspaceLinks[role].map(item=>item.path);
  expect(paths("student")).toContain("/student/assignments");
  expect(paths("student")).not.toContain("/admissions");
  expect(paths("guardian")).toContain("/guardian/academics");
  expect(paths("guardian")).not.toContain("/student/assignments");
  expect(paths("teacher")).toContain("/teacher/gradebook");
  expect(paths("registrar")).toContain("/admissions");
  expect(paths("specialist")).toContain("/coach");
  expect(paths("specialist")).toContain("/support");
  expect(paths("counselor")).toContain("/counselor");
  expect(paths("counselor")).toContain("/support");
  expect(paths("counselor")).not.toContain("/teacher/gradebook");
  expect(paths("student")).toContain("/student/study-groups");
 });
 it("marks only the selected destination and preserves its concrete route",()=>{
  const markup=renderToStaticMarkup(createElement(SidebarLinks,{links:workspaceLinks.student,activePath:"/student/study-groups"}));
  expect(markup).toContain('href="/student/study-groups" aria-current="page"');
  expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  expect(markup).not.toContain('href="/counselor"');
 });
});
