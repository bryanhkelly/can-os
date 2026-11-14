import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {SidebarLinks,workspaceLinks} from "@/components/shell/WorkspaceNavigation";
import {getActiveWorkspacePath,getWorkspaceHome,getWorkspaceLinks,isFocusedClassroomRoute} from "@/components/shell/workspace-navigation.registry";
import { roleCapabilities } from "@/domain/access-context";
import {createMemoryHistory,createRootRoute,createRouter,RouterProvider} from "@tanstack/react-router";
import { getWorkspaceScopeLabel } from "@/components/shell/workspace-scope";

vi.mock("@/modules/identity/workspace-session.functions",()=>({getWorkspaceSession:vi.fn()}));

describe("canonical workspace navigation",()=>{
 it("provides exactly one shared messaging module for every workspace role",()=>{
  for(const [role,links] of Object.entries(workspaceLinks)){
   expect(links.filter(item=>item.path==="/messages"),role)
   .toEqual(roleCapabilities[role]?.includes("communication.send")
    ?[{title:"Messages",path:"/messages",icon:"messages"}]:[]);
  expect(getActiveWorkspacePath(links,"/messages"),role)
   .toBe(roleCapabilities[role]?.includes("communication.send")?"/messages":undefined);
  }
 });
 it("renders Site Admin messaging in both expanded and collapsed navigation",async()=>{
  for(const collapsed of [false,true]){
   const root=createRootRoute({component:()=>createElement(SidebarLinks,{
    links:workspaceLinks.site_admin,activePath:"/messages",collapsed,
   })});
   const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/messages"]})});
   await router.load();
   const markup=renderToStaticMarkup(createElement(RouterProvider,{router}));
   expect(markup.match(/<a[^>]*href="\/messages"[^>]*>/g)).toHaveLength(1);
   expect(markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/messages"');
   expect(markup).toContain("Messages");
   expect(markup).not.toContain('href="/notifications"');
  }
 });
 it("keeps notifications out of every role's sidebar and mobile navigation",()=>{
  for(const [role,links] of Object.entries(workspaceLinks)){
   expect(links.some(item=>item.path.startsWith("/notifications")),role).toBe(false);
   expect(links.some(item=>item.title==="Notifications"),role).toBe(false);
  }
 });
 it("has a landing page for each recognized member role",()=>{
  for(const role of ["student","teacher","guardian","registrar","specialist","counselor"]){
   const home=getWorkspaceHome(role);
   const links=getWorkspaceLinks(role);
   expect(home).toMatch(/^\//);
   expect(links?.some(item=>item.path===home)).toBe(true);
  }
 });
 it("does not expose another role's navigation destinations",()=>{
  const paths=(role:string)=>getWorkspaceLinks(role)?.map(item=>item.path)??[];
  expect(paths("student")).toContain("/student/courses");
  expect(paths("student")).toContain("/student/my-school");
  expect(workspaceLinks.student.find(item=>item.path==="/student/my-school")?.title).toBe("School profile");
  expect(paths("student")).not.toContain("/admissions");
  expect(paths("guardian")).toContain("/guardian/students");
  expect(workspaceLinks.guardian.find(item=>item.path==="/guardian/students")?.title).toBe("Students");
  expect(workspaceLinks.guardian.find(item=>item.path==="/guardian/experiences")?.title).toBe("School profile");
  expect(paths("guardian")).not.toContain("/student/assignments");
  expect(paths("teacher")).toContain("/teacher/gradebook");
  expect(paths("registrar")).toContain("/admissions");
  expect(paths("registrar")).toContain("/admin");
  expect(paths("student")).not.toContain("/admin");
  expect(paths("guardian")).not.toContain("/admin");
  expect(paths("specialist")).toContain("/home");
  expect(paths("specialist")).not.toContain("/teacher/gradebook");
  expect(paths("counselor")).toContain("/home");
  expect(paths("counselor")).not.toContain("/admin");
  expect(paths("counselor")).not.toContain("/teacher/gradebook");
  expect(paths("student")).toContain("/student/my-school");
 });
 it("starts every role with one generated Home item that opens the role home",()=>{
  for(const [role,links] of Object.entries(workspaceLinks)){
   expect(links[0],role).toMatchObject({title:"Home",icon:"home",path:getWorkspaceHome(role)});
   expect(links.filter(item=>item.title==="Home"),role).toHaveLength(1);
   expect(links.filter(item=>item.icon==="home"),role).toHaveLength(1);
  }
  expect(workspaceLinks.site_admin[0]?.path).toBe("/home");
    expect(getActiveWorkspacePath(workspaceLinks.site_admin,"/launch/school")).toBe("/launch/school");
 });
 it("marks only the exact route current when nested destinations share a prefix",async()=>{
  const root=createRootRoute({component:()=>createElement(SidebarLinks,{links:workspaceLinks.teacher,
   activePath:getActiveWorkspacePath(workspaceLinks.teacher,"/teacher/missing-work")})});
  const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/teacher/missing-work"]})});
  await router.load();
  const markup=renderToStaticMarkup(createElement(RouterProvider,{router}));
  expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  expect(markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain('href="/teacher/gradebook"');
 });
 it("selects the most specific destination for nested routes",()=>{
  expect(getActiveWorkspacePath(workspaceLinks.teacher,"/teacher/gradebook/assessment/123")).toBe("/teacher/gradebook");
  expect(getActiveWorkspacePath(workspaceLinks.student,"/student/courses/section-1")).toBe("/student/courses");
  expect(getActiveWorkspacePath(workspaceLinks.teacher,"/teachers")).toBeUndefined();
  expect(getWorkspaceLinks("unknown_role")).toBeUndefined();
  expect(getWorkspaceHome("unknown_role")).toBeUndefined();
 });
 it("selects explicitly owned nested and cross-workspace destinations without guessing parents",()=>{
  expect(getActiveWorkspacePath(workspaceLinks.student,"/classes")).toBe("/student/courses");
  expect(getActiveWorkspacePath(workspaceLinks.teacher,"/teacher/missing-work")).toBe("/teacher/gradebook");
  expect(getActiveWorkspacePath(workspaceLinks.guardian,"/guardian/report-cards")).toBe("/guardian/students");
  expect(getActiveWorkspacePath(workspaceLinks.registrar,"/operations/curriculum-marketplace")).toBe("/operations/curriculum");
    expect(getActiveWorkspacePath(workspaceLinks.site_admin,"/sites/school/publish/")).toBe("/sites");
    expect(getActiveWorkspacePath(workspaceLinks.site_admin,"/sites/school/profile")).toBe("/sites");
  expect(getActiveWorkspacePath(workspaceLinks.site_admin,"/sites/school/parent-information")).toBe("/sites");
  // Site Today is a drill-in from Home for school administration, not a separate destination.
  expect(getActiveWorkspacePath(workspaceLinks.site_admin,"/sites/school")).toBe("/home");
    expect(workspaceLinks.site_admin.find(item=>item.path==="/sites")?.title).toBe("School profile");
    expect(workspaceLinks.registrar.some(item=>item.path==="/sites")).toBe(false);
  expect(getActiveWorkspacePath(workspaceLinks.site_leader,"/sites/school")).toBe("/home");
  expect(getActiveWorkspacePath(workspaceLinks.site_leader,"/sites/school/publish")).toBeUndefined();
  expect(getActiveWorkspacePath(workspaceLinks.registrar,"/classes")).toBeUndefined();
  expect(getActiveWorkspacePath(workspaceLinks.teacher,"/staff/students/person")).toBe("/staff/students");
  expect(getActiveWorkspacePath(workspaceLinks.teacher,"/teacher/unowned")).toBeUndefined();
  expect(getActiveWorkspacePath(workspaceLinks.student,"/classes-archive")).toBeUndefined();
  expect(getActiveWorkspacePath(workspaceLinks.registrar,"/sites/school/unowned")).toBeUndefined();
 });
 it("declares icons and unique destinations for every role",()=>{
  for(const links of Object.values(workspaceLinks)){
   expect(new Set(links.map(item=>item.path)).size).toBe(links.length);
   for(const item of links)expect(item.icon).toBeTruthy();
  }
 });
 it("identifies the active grant's school rather than the authorized school count",()=>{
  const sites=[{id:"west",name:"West School"},{id:"east",name:"East School"}];
  expect(getWorkspaceScopeLabel({siteId:"east"},sites)).toBe("East School");
  expect(getWorkspaceScopeLabel({siteId:null},sites)).toBe("All authorized schools (2)");
  expect(getWorkspaceScopeLabel({siteId:null},sites.slice(0,1))).toBe("School scope: West School");
  expect(getWorkspaceScopeLabel({siteId:null},[])).toBe("Organization workspace");
  expect(getWorkspaceScopeLabel({siteId:"missing"},sites)).not.toContain("West");
 });
 it("does not give a role duplicate labels for one destination",()=>{
  const facilitatorLinks=getWorkspaceLinks("room_facilitator")??[];
  expect(new Set(facilitatorLinks.map(item=>item.path)).size).toBe(facilitatorLinks.length);
 });
 it("focuses the classroom shell only for roles that can use the class workspace",()=>{
  expect(isFocusedClassroomRoute("/classes","?section=section-id","student")).toBe(true);
  expect(isFocusedClassroomRoute("/classes","?section=section-id","guardian")).toBe(true);
  expect(isFocusedClassroomRoute("/classes","?section=section-id","teacher")).toBe(true);
  expect(isFocusedClassroomRoute("/classes","?section=section-id","site_admin")).toBe(false);
  expect(isFocusedClassroomRoute("/student/courses","?section=section-id","student")).toBe(true);
  expect(isFocusedClassroomRoute("/student/courses","?section=section-id&view=catalog","student")).toBe(false);
  expect(isFocusedClassroomRoute("/classes","?tab=overview","teacher")).toBe(false);
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
  expect(markup).toContain('href="/home"');
 });
 it("renders the declared icon even when the path suggests a different icon",async()=>{
  const root=createRootRoute({component:()=>createElement(SidebarLinks,{links:[
   {title:"Schedule review",path:"/calendar",icon:"safety"},
  ]})});
  const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/"]})});
  await router.load();
  const markup=renderToStaticMarkup(createElement(RouterProvider,{router}));
  expect(markup).toContain("lucide-shield-alert");
  expect(markup).not.toContain("lucide-calendar-days");
 });
});
