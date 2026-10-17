import {describe,expect,it} from "vitest";
import {workspaceHome,workspaceLinks} from "@/components/shell/WorkspaceNavigation";

describe("canonical workspace navigation",()=>{
 it("has a landing page for each recognized member role",()=>{
  for(const role of ["student","teacher","guardian","registrar","specialist"]){
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
 });
});
