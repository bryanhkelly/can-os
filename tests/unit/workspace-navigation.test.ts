import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {SidebarLinks,workspaceHome,workspaceLinks} from "@/components/shell/WorkspaceNavigation";
import {createMemoryHistory,createRootRoute,createRouter,RouterProvider} from "@tanstack/react-router";

vi.mock("@/modules/identity/workspace-session.functions",()=>({getWorkspaceSession:vi.fn()}));

describe("canonical workspace navigation",()=>{
 it("has a landing page for each recognized member role",()=>{
  for(const role of ["student","teacher","guardian","registrar","specialist","counselor"]){
   expect(workspaceHome[role]).toMatch(/^\//);
   expect(workspaceLinks[role].some(item=>item.path===workspaceHome[role])).toBe(true);
  }
 });
 it("does not expose another role's navigation destinations",()=>{
  const paths=(role:string)=>workspaceLinks[role].map(item=>item.path);
  expect(paths("student")).toContain("/student/courses");
  expect(paths("student")).toContain("/student/my-school");
  expect(paths("student")).not.toContain("/admissions");
  expect(paths("guardian")).toContain("/guardian/academics");
  expect(paths("guardian")).not.toContain("/student/assignments");
  expect(paths("teacher")).toContain("/teacher/gradebook");
  expect(paths("registrar")).toContain("/admissions");
  expect(paths("registrar")).toContain("/admin");
  expect(paths("student")).not.toContain("/admin");
  expect(paths("guardian")).not.toContain("/admin");
  expect(paths("specialist")).toContain("/coach");
  expect(paths("specialist")).not.toContain("/teacher/gradebook");
  expect(paths("counselor")).toContain("/counselor");
  expect(paths("counselor")).not.toContain("/admin");
  expect(paths("counselor")).not.toContain("/teacher/gradebook");
  expect(paths("student")).toContain("/student/my-school");
 });
 it("marks only the selected destination and preserves its concrete route",async()=>{
  const root=createRootRoute({component:()=>createElement(SidebarLinks,{links:workspaceLinks.student,activePath:"/student/my-school"})});
  const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/"]})});
  await router.load();
  const markup=renderToStaticMarkup(createElement(RouterProvider,{router}));
  const selected=markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
  expect(selected).toContain('href="/student/my-school"');
  expect(selected).toContain("focus-visible:ring-2");
  expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  expect(markup).not.toContain('href="/counselor"');
 });
});
