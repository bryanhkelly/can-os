import {Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {Search} from "lucide-react";
import {openPaletteEvent} from "@/lib/workspace-search";

type Membership={id:string;role:string;firstName:string;lastName:string};
type Session={authenticated:boolean;activeGrantId?:string;grants?:Membership[]};
const home:Record<string,string>={student:"/student",guardian:"/guardian",teacher:"/teacher",registrar:"/operations",specialist:"/coach"};
const links:Record<string,{title:string;path:string}[]>={
 student:[{title:"Today",path:"/student"},{title:"Assignments",path:"/student/assignments"},{title:"Courses",path:"/student/courses"},{title:"Support",path:"/student/support"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 guardian:[{title:"Family",path:"/guardian"},{title:"Academics",path:"/guardian/academics"},{title:"Attendance",path:"/guardian/attendance"},{title:"Offers",path:"/guardian/admission-offers"},{title:"Messages",path:"/messages"}],
 teacher:[{title:"Today",path:"/teacher"},{title:"Gradebook",path:"/teacher/gradebook"},{title:"Students",path:"/staff/students"},{title:"Missing work",path:"/teacher/missing-work"},{title:"Calendar",path:"/calendar"}],
 registrar:[{title:"Operations",path:"/operations"},{title:"Admissions",path:"/admissions"},{title:"Sites",path:"/sites"},{title:"Students",path:"/staff/students"},{title:"School years",path:"/operations/school-years"}],
 specialist:[{title:"Caseload",path:"/coach"},{title:"Students",path:"/staff/students"},{title:"Insights",path:"/operations/insights"},{title:"Messages",path:"/messages"}]
};
export function WorkspaceNavigation(){
 const [session,setSession]=useState<Session>({authenticated:false});
 useEffect(()=>{let active=true;
  fetch("/access/session",{credentials:"same-origin",cache:"no-store"})
   .then(async response=>response.ok?response.json() as Promise<Session>:{authenticated:false})
   .then(value=>{if(active)setSession(value)})
   .catch(()=>{if(active)setSession({authenticated:false})});
  return()=>{active=false};
 },[]);
 const grants=session.grants??[];
 const current=grants.find(g=>g.id===session.activeGrantId);
 const switchGrant=async(id:string)=>{
  const target=grants.find(g=>g.id===id);
  if(!target)return;
  const response=await fetch("/access/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId:id})});
  if(!response.ok)throw new Error("Unable to change membership");
  window.location.assign(home[target.role]??"/");
 };
 const signOut=async()=>{
  const response=await fetch("/access/logout",{method:"POST",credentials:"same-origin"});
  if(response.ok)window.location.assign("/access");
 };
 return <nav aria-label="CAN OS primary navigation" className="border-b bg-card px-5 py-3">
  <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
   <Link to="/" className="font-serif text-xl font-semibold">CAN OS</Link>
   <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">
    {current&&(links[current.role]??[]).map(item=><a key={item.path} href={item.path} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{item.title}</a>)}
   </div>
   {current&&<button type="button" aria-label="Search workspace" onClick={()=>window.dispatchEvent(new Event(openPaletteEvent))} className="rounded-lg border px-3 py-2 text-xs"><Search className="mr-1 inline size-3"/>Search</button>}
   {session.authenticated&&<label className="text-xs text-muted-foreground">Workspace
    <select aria-label="Active membership" value={session.activeGrantId??""} onChange={event=>{void switchGrant(event.target.value).catch(()=>window.alert("Unable to switch membership"));}} className="ml-2 rounded-lg border bg-background p-2">
     {grants.map(g=><option key={g.id} value={g.id}>{g.firstName} {g.lastName} · {g.role}</option>)}
    </select>
   </label>}
   {session.authenticated?<button type="button" onClick={()=>void signOut()} className="text-xs font-semibold">Sign out</button>:<Link to="/access" className="text-xs font-semibold">Sign in</Link>}
  </div>
 </nav>;
}
