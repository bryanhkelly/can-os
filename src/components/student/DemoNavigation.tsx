import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Demo personas are presentation/workflow selectors, NOT authenticated identities.
 * Never rely on this browser value for server-side authorization.
 */
export const demoRoles = ["student", "teacher", "guardian", "registrar", "specialist"] as const;
export type DemoPersona = typeof demoRoles[number];
export const demoPersonaStorageKey = "can-os-demo-persona";
export const demoPersonaHome: Record<DemoPersona, string> = {
 student: "/student",
 teacher: "/teacher/missing-work",
 guardian: "/admissions/families",
 registrar: "/admissions",
 specialist: "/student/support",
};
export const demoNavigationLinks: ReadonlyArray<{to: string; label: string; roles: readonly DemoPersona[]}> = [
 {to:"/operations",label:"Needs You",roles:["teacher","registrar","specialist"]},
 {to:"/admissions",label:"Admissions",roles:["registrar"]},
 {to:"/admissions/families",label:"Family Readiness",roles:["guardian","registrar"]},
 {to:"/admissions/capacity",label:"Capacity",roles:["registrar"]},
 {to:"/teacher/missing-work",label:"Missing Work",roles:["teacher"]},
 {to:"/calendar-export",label:"Calendar Export",roles:["student","teacher","guardian"]},
 {to:"/readiness",label:"Launch",roles:["registrar"]},
 {to:"/profiles",label:"Profiles",roles:["registrar"]},
 {to:"/student",label:"Today",roles:["student","guardian"]},
 {to:"/student/courses",label:"Classes",roles:["student","guardian","teacher"]},
 {to:"/student/assignments",label:"Assignments",roles:["student","guardian","teacher"]},
 {to:"/student/discussions",label:"Discussions",roles:["student","guardian"]},
 {to:"/student/study-groups",label:"Study Groups",roles:["student"]},
 {to:"/teacher/discussions",label:"Manage Discussions",roles:["teacher"]},
 {to:"/student/experiences",label:"Calendar",roles:["student","guardian","teacher"]},
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
 const location=useLocation();
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const requested=params.get("persona");
  const stored=window.localStorage.getItem(demoPersonaStorageKey);
  const next=getDemoPersona(requested ?? stored);
  setRole(next);
  window.localStorage.setItem(demoPersonaStorageKey,next);
 },[location.pathname]);
 const changePersona=(next:DemoPersona)=>{
  window.localStorage.setItem(demoPersonaStorageKey,next);
  setRole(next);
  // Go to a valid landing screen instead of retaining the previous persona's route.
  window.location.assign(demoPersonaHome[next]+"?persona="+next);
 };
 return <nav aria-label="CAN OS primary navigation" className="border-b border-border bg-card px-5 py-3">
  <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3">
   <Link to="/" className="font-serif text-xl font-semibold">CAN OS</Link>
   <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">{visibleDemoLinks(role).map(x=><Link key={x.to} to={x.to} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{x.label}</Link>)}</div>
   <label className="flex items-center gap-2 text-xs text-muted-foreground">Demo persona
    <select aria-label="Demo persona" value={role} onChange={event=>changePersona(getDemoPersona(event.target.value))} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
     {demoRoles.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
    </select>
   </label>
  </div>
  <p className="mx-auto mt-1 max-w-6xl text-[10px] text-muted-foreground">Shared synthetic demonstration · Persona switching changes the visible workflow, not server authorization. Do not enter real student data.</p>
 </nav>;
}
