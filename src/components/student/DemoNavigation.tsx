import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { openPaletteEvent } from "@/lib/workspace-search";

/** The verified server grant determines all navigable workspaces. */
export const demoRoles = ["student", "teacher", "guardian", "registrar", "specialist"] as const;
export type DemoPersona = typeof demoRoles[number];
export const demoPersonaHome: Record<DemoPersona, string> = {
 student: "/student",
 teacher: "/teacher",
 guardian: "/guardian",
 registrar: "/admissions",
 specialist: "/coach",
};
export const demoNavigationLinks: ReadonlyArray<{to: string; label: string; roles: readonly DemoPersona[]}> = [
 {to:"/guardian",label:"Family Home",roles:["guardian"]},
 {to:"/teacher",label:"Today",roles:["teacher"]},
 {to:"/coach",label:"Caseload",roles:["specialist"]},
 {to:"/admin",label:"Admin",roles:["registrar"]},
 {to:"/calendar",label:"Calendar",roles:["student","teacher","guardian","registrar","specialist"]},
 {to:"/messages",label:"Messages",roles:["student","teacher","guardian","registrar","specialist"]},
 {to:"/operations/insights",label:"Insights",roles:["teacher","registrar","specialist"]},
 {to:"/operations",label:"Needs You",roles:["teacher","registrar","specialist"]},
 {to:"/staff/students",label:"Students",roles:["teacher","registrar","specialist"]},
 {to:"/staff/teachers",label:"Teachers",roles:["registrar"]},
 {to:"/teacher/gradebook",label:"Gradebook",roles:["teacher"]},
 {to:"/admissions",label:"Admissions",roles:["registrar"]},
 {to:"/admissions/families",label:"Family Readiness",roles:["guardian","registrar"]},
 {to:"/guardian/academics",label:"Academic Progress",roles:["guardian"]},
 {to:"/guardian/attendance",label:"Attendance",roles:["guardian"]},
 {to:"/staff/attendance",label:"Attendance",roles:["teacher","registrar"]},
 {to:"/guardian/report-cards",label:"Report Cards",roles:["guardian"]},
 {to:"/student/report-card",label:"Report Card",roles:["student"]},
 {to:"/admissions/capacity",label:"Capacity",roles:["registrar"]},
 {to:"/operations/launch",label:"Program Launch",roles:["registrar"]},
 {to:"/teacher/missing-work",label:"Missing Work",roles:["teacher"]},
 {to:"/calendar-export",label:"Calendar Export",roles:["student","teacher","guardian"]},
 {to:"/readiness",label:"Launch",roles:["registrar"]},
 {to:"/profiles",label:"Profiles",roles:["registrar"]},
 {to:"/student",label:"Today",roles:["student"]},
 {to:"/student/courses",label:"Classes",roles:["student","teacher"]},
 {to:"/student/assignments",label:"Assignments",roles:["student","teacher"]},
 {to:"/student/discussions",label:"Discussions",roles:["student","guardian"]},
 {to:"/student/study-groups",label:"Study Groups",roles:["student"]},
 {to:"/teacher/discussions",label:"Manage Discussions",roles:["teacher"]},
 {to:"/student/experiences",label:"Experiences",roles:["student","guardian","teacher"]},
 {to:"/student/support",label:"Support",roles:["student","guardian","teacher","specialist"]},
 {to:"/student/notifications",label:"Notifications",roles:["student","guardian","teacher","registrar","specialist"]},
 {to:"/student/settings",label:"Settings",roles:["student","guardian"]},
];
export function getDemoPersona(raw: string | null | undefined): DemoPersona {
 return demoRoles.includes(raw as DemoPersona) ? raw as DemoPersona : "student";
}
export function visibleDemoLinks(role: DemoPersona) {
 return demoNavigationLinks.filter(link => link.roles.includes(role));
}
export function DemoNavigation(){
 const [role,setRole]=useState<DemoPersona>("student");
 const [memberships,setMemberships]=useState<Array<{id:string;role:string;firstName:string;lastName:string}>>([]);
 const [signedIn,setSignedIn]=useState(false);
 const [activeGrantId,setActiveGrantId]=useState("");

 useEffect(()=>{let canceled=false;fetch("/access/session",{credentials:"same-origin"})
  .then(async response=>response.ok?response.json():null)
  .then(data=>{if(canceled||!data?.authenticated)return;
   setSignedIn(true);
   setMemberships(data.grants??[]);
   setActiveGrantId(data.activeGrantId??"");
   const active=(data.grants??[]).find((g:{id:string})=>g.id===data.activeGrantId);
   if(active&&demoRoles.includes(active.role)){setRole(active.role);}
  }).catch(()=>{});return()=>{canceled=true};},[]);
 const logout=async()=>{
  const response=await fetch("/access/logout",{method:"POST",credentials:"same-origin"});
  if(response.ok)window.location.assign("/access");
  else window.alert("Sign out failed. Please try again.");
 };
 const changeMembership=(grantId:string)=>{
  const grant=memberships.find(x=>x.id===grantId);
  if(!grant)return;
  void fetch("/access/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId})})
   .then(response=>{if(!response.ok)throw new Error("Membership unavailable");window.location.assign(demoPersonaHome[grant.role as DemoPersona]??"/");})
   .catch(()=>window.alert("Unable to switch membership"));
 };

 return <nav aria-label="CAN OS primary navigation" className="border-b border-border bg-card px-5 py-3">
  <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3">
   <Link to="/" className="font-serif text-xl font-semibold">CAN OS</Link>
   <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">{(signedIn?visibleDemoLinks(role):[]).map(x=><Link key={x.to} to={x.to} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{x.label}</Link>)}</div>
   <button type="button" aria-label="Search workspace" onClick={()=>window.dispatchEvent(new Event(openPaletteEvent))} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
    <Search className="size-3.5" aria-hidden/> Search <kbd className="rounded border border-border px-1 text-[10px]">Ctrl+K</kbd>
   </button>
   {signedIn&&<label className="flex items-center gap-2 text-xs text-muted-foreground">Active membership
    <select aria-label="Active membership" value={activeGrantId} onChange={event=>changeMembership(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
     {memberships.map(g=><option key={g.id} value={g.id}>{g.firstName} {g.lastName} · {g.role}</option>)}
    </select>
   </label>}
   {signedIn?<button type="button" onClick={()=>void logout()} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Sign out</button>:<Link to="/access" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Sign in</Link>}
  </div>
  <p className="mx-auto mt-1 max-w-6xl text-[10px] text-muted-foreground">Workspaces and navigation follow verified account permissions.</p>
 </nav>;
}
