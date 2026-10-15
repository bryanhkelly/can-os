import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
const roles=["student","teacher","guardian","registrar","specialist"] as const;
type Role=typeof roles[number];
const links=[
 {to:"/operations",label:"Needs You"},
 {to:"/admissions",label:"Admissions"},
 {to:"/admissions/families",label:"Family Readiness"},
 {to:"/teacher/missing-work",label:"Missing Work"},
 {to:"/calendar-export",label:"Calendar Export"},
 {to:"/readiness",label:"Launch"},
 {to:"/profiles",label:"Profiles"},
 {to:"/student",label:"Today"},
 {to:"/student/courses",label:"Classes"},
 {to:"/student/assignments",label:"Assignments"},
 {to:"/student/discussions",label:"Discussions"},
 {to:"/teacher/discussions",label:"Manage Discussions"},
 {to:"/student/experiences",label:"Calendar"},
 {to:"/student/support",label:"Support"},
 {to:"/student/notifications",label:"Notifications"},
 {to:"/student/settings",label:"Settings"},
] as const;
export function DemoNavigation(){
 const [role,setRole]=useState<Role>("student");
 const location=useLocation();
 useEffect(()=>{
  const value=new URLSearchParams(window.location.search).get("persona");
  if(roles.includes(value as Role))setRole(value as Role);
 },[location.pathname]);
 return <nav aria-label="CAN OS primary navigation" className="border-b border-border bg-card px-5 py-3">
  <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3">
   <Link to="/" className="font-serif text-xl font-semibold">CAN OS</Link>
   <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">{links.map(x=><Link key={x.to} to={x.to} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{x.label}</Link>)}</div>
   <label className="flex items-center gap-2 text-xs text-muted-foreground">Demo persona
    <select aria-label="Demo persona" value={role} onChange={event=>{const next=event.target.value as Role;setRole(next);window.history.replaceState(null,"",window.location.pathname+`?persona=${next}`);}} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
     {roles.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
    </select>
   </label>
  </div>
  <p className="mx-auto mt-1 max-w-6xl text-[10px] text-muted-foreground">Synthetic-only navigation. Persona selection does not grant server permissions.</p>
 </nav>;
}
