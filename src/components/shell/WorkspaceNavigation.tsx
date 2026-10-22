import {Link,useLocation,useNavigate} from "@tanstack/react-router";
import {lazy,Suspense,useEffect,useState,type ReactNode} from "react";
import {Bell,MessageCircle,Search,Menu,Home,BookOpen,Users,CalendarDays,ClipboardList,Settings,MessagesSquare,LifeBuoy} from "lucide-react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {ContextTray} from "@/components/workspace";
import {useWorkspaceSession} from "./WorkspaceSession";

const NotificationTray=lazy(()=>import("./NotificationTray").then(module=>({default:module.NotificationTray})));
const AskCanConversation=lazy(()=>import("@/components/conversation/AskCanConversation").then(module=>({default:module.AskCanConversation})));

export const workspaceHome:Record<string,string>={student:"/student",guardian:"/guardian",teacher:"/teacher",registrar:"/operations",specialist:"/coach",counselor:"/counselor",network_admin:"/network",can_network_steward:"/network-steward"};
export const workspaceLinks:Record<string,{title:string;path:string}[]>={
 network_admin:[{title:"Network locations",path:"/network"}],
 can_network_steward:[{title:"Network contracts",path:"/network-steward"}],
 student:[{title:"Today",path:"/student"},{title:"Assignments",path:"/student/assignments"},{title:"My classes",path:"/student/courses"},{title:"Study groups",path:"/student/study-groups"},{title:"Support",path:"/student/support"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 guardian:[{title:"Family",path:"/guardian"},{title:"Classes",path:"/classes"},{title:"Academics",path:"/guardian/academics"},{title:"Attendance",path:"/guardian/attendance"},{title:"Offers",path:"/guardian/admission-offers"},{title:"Messages",path:"/messages"}],
 teacher:[{title:"Today",path:"/teacher"},{title:"Classes",path:"/classes"},{title:"Gradebook",path:"/teacher/gradebook"},{title:"Students",path:"/staff/students"},{title:"Teachers",path:"/staff/teachers"},{title:"Study groups",path:"/teacher/study-groups"},{title:"Referrals",path:"/student/support"},{title:"Missing work",path:"/teacher/missing-work"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 registrar:[{title:"Operations",path:"/operations"},{title:"Admissions",path:"/admissions"},{title:"Sites",path:"/sites"},{title:"Students",path:"/staff/students"},{title:"School years",path:"/operations/school-years"},{title:"Curriculum",path:"/operations/curriculum"},{title:"Administration",path:"/admin"}],
 specialist:[{title:"Caseload",path:"/coach"},{title:"Referrals & services",path:"/support"},{title:"Students",path:"/staff/students"},{title:"Insights",path:"/operations/insights"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 counselor:[{title:"Counselor caseload",path:"/counselor"},{title:"Referrals & services",path:"/support"},{title:"Students",path:"/staff/students"},{title:"Insights",path:"/operations/insights"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}]
};
export function SidebarLinks({links,activePath}:{links:{title:string;path:string}[];activePath?:string}){
 return <nav aria-label="CAN OS primary navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
  {links.map(item=>{
   const Icon=item.path.includes("calendar")?CalendarDays:item.path.includes("messages")?MessagesSquare:
    item.path.includes("students")||item.path.includes("teachers")?Users:item.path.includes("class")||item.path.includes("courses")?BookOpen:
    item.path.includes("support")||item.path.includes("coach")||item.path.includes("counselor")?LifeBuoy:
    item.path.includes("assignments")||item.path.includes("gradebook")?ClipboardList:Home;
   return <Link key={item.path} to={item.path} aria-current={activePath===item.path?"page":undefined}
    className={"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium "+(activePath===item.path?"bg-muted text-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Icon className="size-4 shrink-0" aria-hidden="true"/>{item.title}</Link>;
  })}
 </nav>;
}
export function WorkspaceNavigation({children}:{children?:ReactNode}){
 const location=useLocation();
 const navigate=useNavigate();
 const {session,error:sessionError}=useWorkspaceSession();
 const [error,setError]=useState("");
 const [changing,setChanging]=useState(false);
 const [tray,setTray]=useState<"notifications"|"ask"|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{setTray(null);setMenuOpen(false)},[location.pathname]);
 const authenticated=session?.authenticated?session:null;
 const grants=authenticated?.grants??[];
 const current=grants.find(g=>g.id===authenticated?.activeGrantId);
 const links=current?(workspaceLinks[current.role]??[]):[];
 const activePath=links.filter(item=>location.pathname===item.path||location.pathname.startsWith(item.path+"/"))
  .sort((a,b)=>b.path.length-a.path.length)[0]?.path;
 const switchGrant=async(id:string)=>{
  const target=grants.find(g=>g.id===id);
  if(!target)throw new Error("This membership is unavailable.");
  const response=await fetch("/access/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId:id})});
  if(!response.ok)throw new Error("Unable to change membership");
  window.location.assign(workspaceHome[target.role]??"/");
 };
 const signOut=async()=>{
  const response=await fetch("/access/logout",{method:"POST",credentials:"same-origin"});
  if(!response.ok)throw new Error("Unable to sign out. Please try again.");
  window.location.assign("/access");
 };
 async function changeSession(command:()=>Promise<void>){
  setChanging(true);setError("");
  try{await command()}
  catch(error){setError(error instanceof Error?error.message:"Unable to update your session.");setChanging(false)}
 }
 return <><div className={current?"min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]":"min-h-screen"}>
 {current&&<aside aria-label="Workspace sidebar" className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
  <div className="border-b p-5"><Link to={workspaceHome[current.role]??"/"} className="font-serif text-xl font-semibold">CAN OS</Link><p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Church Academy Network</p></div>
  <div className="p-4"><p className="text-xs uppercase tracking-widest text-muted-foreground">{current.role} workspace</p><p className="mt-2 text-sm font-semibold">{current.firstName} {current.lastName}</p>
   <p className="mt-1 text-xs text-muted-foreground">{authenticated?.sites.map(site=>site.name).join(", ")}</p></div>
  <SidebarLinks links={links} activePath={activePath}/>
  <div className="border-t p-4"><Link to="/profiles" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold"><Users className="size-4" aria-hidden="true"/>My profile</Link>
   <Link to="/account/sessions" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"><Settings className="size-4" aria-hidden="true"/>Account sessions</Link>
   {current.role==="student"&&<Link to="/student/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"><Settings className="size-4" aria-hidden="true"/>Preferences</Link>}</div>
 </aside>}
 <div className="min-w-0"><header aria-label="Workspace top bar" className="sticky top-0 z-30 border-b bg-card px-4 py-3 sm:px-6">
  <div className="flex min-w-0 flex-wrap items-center gap-3">
   {current&&<button type="button" aria-label={menuOpen?"Close workspace navigation":"Open workspace navigation"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)} className="rounded-lg border p-2 lg:hidden"><Menu className="size-4"/></button>}
   <Link to={current?(workspaceHome[current.role]??"/"):"/"} className="mr-auto font-serif text-xl font-semibold">CAN OS</Link>
   {current&&<button type="button" aria-label="Search workspace" onClick={()=>window.dispatchEvent(new Event(openPaletteEvent))} className="rounded-lg border px-3 py-2 text-xs"><Search className="mr-1 inline size-3"/>Search</button>}
   {current?.role==="registrar"&&Boolean(authenticated?.sites.length)&&<label className="text-xs text-muted-foreground">School
    <select aria-label="Open school operations" value="" className="ml-2 max-w-48 rounded-lg border bg-background p-2" onChange={event=>{if(event.target.value)void navigate({to:"/operations",search:{siteId:event.target.value}});}}>
     <option value="">Choose school…</option>
     {authenticated?.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
    </select>
   </label>}
   {current?.role!=="registrar"&&current&&Boolean(authenticated?.sites.length)&&<span className="text-xs text-muted-foreground" title="Schools in this active membership">{authenticated?.sites.map(site=>site.name).join(", ")}</span>}
   {current?.role==="registrar"&&Boolean(authenticated?.programs.length)&&<label className="text-xs text-muted-foreground">Program
    <select aria-label="Open program" value="" className="ml-2 max-w-48 rounded-lg border bg-background p-2" onChange={event=>{if(event.target.value)void navigate({to:"/operations/launch/$programId",params:{programId:event.target.value},search:{siteId:undefined,programId:undefined}});}}>
     <option value="">Choose program…</option>
     {authenticated?.programs.map(program=><option key={program.id} value={program.id}>{program.name}</option>)}
    </select>
   </label>}
   {current&&<><button type="button" onClick={()=>setTray("notifications")} aria-haspopup="dialog" className="rounded-lg border px-3 py-2 text-xs font-semibold"><Bell className="mr-1 inline size-3" aria-hidden="true"/>Notifications</button>
    <button type="button" onClick={()=>setTray("ask")} aria-haspopup="dialog" className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"><MessageCircle className="mr-1 inline size-3" aria-hidden="true"/>Ask CAN</button></>}
   {authenticated&&<label className="text-xs text-muted-foreground">{authenticated.demoFacilitator?"Demo user":"Workspace"}
    <select aria-label={authenticated.demoFacilitator?"Demo user":"Active membership"} disabled={changing} value={authenticated.activeGrantId} onChange={event=>{void changeSession(()=>switchGrant(event.target.value));}} className="ml-2 max-w-64 rounded-lg border bg-background p-2">
     {grants.map(g=><option key={g.id} value={g.id}>{g.firstName} {g.lastName} · {g.role}</option>)}
    </select>
   </label>}
   {authenticated?<button type="button" disabled={changing} onClick={()=>void changeSession(signOut)} className="text-xs font-semibold">Sign out</button>:session&&<Link to="/access" className="text-xs font-semibold">Sign in</Link>}
   {(error||sessionError)&&<p role="alert" className="w-full rounded-lg border border-amber-500 p-3 text-sm">{error||sessionError}</p>}
   {authenticated?.demoFacilitator&&<p role="status" className="w-full rounded-lg border border-amber-500 p-2 text-xs">Demo admin session: acting as {current?.firstName} {current?.lastName} ({current?.role}). Changes affect shared synthetic data. User switches are audited.</p>}
  </div>
 </header>{children}</div></div>
 {current&&<><ContextTray title="Workspace navigation" open={menuOpen} onClose={()=>setMenuOpen(false)}>
  <p className="mb-3 text-sm font-semibold">{current.firstName} {current.lastName} · {current.role}</p>
  <SidebarLinks links={links} activePath={activePath}/><Link to="/profiles" className="mt-3 block border-t p-3 text-sm underline">My profile</Link><Link to="/account/sessions" className="block p-3 text-sm underline">Account sessions</Link>
 </ContextTray><ContextTray title="Notifications" open={tray==="notifications"} onClose={()=>setTray(null)}>
  <Suspense fallback={<p role="status">Loading notifications...</p>}><NotificationTray onNavigate={()=>setTray(null)}/></Suspense>
 </ContextTray>
 <ContextTray title="Ask CAN" open={tray==="ask"} onClose={()=>setTray(null)}>
  <p className="text-sm text-muted-foreground">Your conversations follow you between workspaces. Answers and proposed actions use your verified permissions; this page does not expand them.</p>
  <Link to="/ask" onClick={()=>setTray(null)} className="mt-2 inline-block text-sm underline">Open full conversation page</Link>
  {current.role==="guardian"&&<Link to="/guardian/watching" onClick={()=>setTray(null)} className="ml-4 text-sm underline">Things CAN Is Watching</Link>}
  <Suspense fallback={<p role="status">Loading Ask CAN...</p>}><AskCanConversation/></Suspense>
 </ContextTray></>}
 </>;
}
