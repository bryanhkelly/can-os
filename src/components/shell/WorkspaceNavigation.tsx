import {Link,useLocation} from "@tanstack/react-router";
import {lazy,Suspense,useEffect,useState,type ReactNode} from "react";
import {Bell,MessageCircle,Search,Menu,ChevronDown,UserRound,Home,BookOpen,Users,CalendarDays,ClipboardList,Settings,MessagesSquare,LifeBuoy,ShieldAlert} from "lucide-react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {ContextTray,WorkspaceNotice} from "@/components/workspace";
import {WorkspaceContextSwitcher} from "./WorkspaceContextSwitcher";
import {useWorkspaceSession} from "./WorkspaceSession";

const NotificationTray=lazy(()=>import("./NotificationTray").then(module=>({default:module.NotificationTray})));
const AskCanConversation=lazy(()=>import("@/components/conversation/AskCanConversation").then(module=>({default:module.AskCanConversation})));

export const workspaceHome:Record<string,string>={site_website_editor:"/site-website",room_facilitator:"/site/day",site_staff:"/site/day",site_leader:"/site/day",paraeducator:"/profiles",safeguarding_responder:"/safeguarding",safeguarding_lead:"/safeguarding",student:"/student",guardian:"/guardian",teacher:"/teacher",registrar:"/operations",specialist:"/coach",counselor:"/counselor",network_admin:"/network",can_network_steward:"/network-steward"};
export const workspaceLinks:Record<string,{title:string;path:string}[]>={
 site_website_editor:[{title:"Website",path:"/site-website"}],
 room_facilitator:[{title:"Report a safety concern",path:"/safeguarding"},{title:"Today",path:"/site/day"},{title:"Attendance",path:"/staff/attendance"},{title:"Roster",path:"/site/day"}],
 site_staff:[{title:"Report a safety concern",path:"/safeguarding"},{title:"Today",path:"/site/day"},{title:"Students",path:"/staff/students"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 site_leader:[{title:"Report a safety concern",path:"/safeguarding"},{title:"Today",path:"/site/day"},{title:"Students",path:"/staff/students"},{title:"Staff",path:"/staff/teachers"},{title:"Schedule",path:"/calendar"},{title:"Attendance",path:"/staff/attendance"},{title:"Community",path:"/site-website"},{title:"Operations",path:"/operations"}],
 paraeducator:[{title:"Report a safety concern",path:"/safeguarding"},{title:"My profile",path:"/profiles"}],
 safeguarding_responder:[{title:"Assigned safeguarding",path:"/safeguarding"}],
 safeguarding_lead:[{title:"Assigned safeguarding",path:"/safeguarding"}],
 network_admin:[{title:"Network operations",path:"/network"},{title:"Operations",path:"/operations"}],
 can_network_steward:[{title:"Network contracts",path:"/network-steward"}],
 student:[{title:"Today",path:"/student"},{title:"Learn",path:"/student/courses"},{title:"My School",path:"/student/my-school"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"},{title:"Support",path:"/student/support"}],
 guardian:[{title:"Home",path:"/guardian"},{title:"Children",path:"/guardian/academics"},{title:"School",path:"/guardian/experiences"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 teacher:[{title:"Today",path:"/teacher"},{title:"Classes",path:"/classes"},{title:"Students",path:"/staff/students"},{title:"Gradebook",path:"/teacher/gradebook"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 registrar:[{title:"Operations",path:"/operations"},{title:"Admissions",path:"/admissions"},{title:"Students",path:"/staff/students"},{title:"Sites",path:"/sites"},{title:"School years",path:"/operations/school-years"},{title:"Curriculum",path:"/operations/curriculum"},{title:"Administration",path:"/admin"}],
 specialist:[{title:"Caseload",path:"/coach"},{title:"Students",path:"/staff/students"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}],
 counselor:[{title:"Caseload",path:"/counselor"},{title:"Students",path:"/staff/students"},{title:"Calendar",path:"/calendar"},{title:"Messages",path:"/messages"}]
};
export function SidebarLinks({links,activePath}:{links:{title:string;path:string}[];activePath?:string}){
 return <nav aria-label="CAN OS primary navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
  {links.map(item=>{
   const Icon=item.path.includes("safeguarding")?ShieldAlert:item.path.includes("calendar")?CalendarDays:item.path.includes("messages")?MessagesSquare:
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
 const {session,error:sessionError}=useWorkspaceSession();
 const [error,setError]=useState("");
 const [switcherError,setSwitcherError]=useState("");
 const [changing,setChanging]=useState(false);
 const [tray,setTray]=useState<"notifications"|"ask"|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [switcherOpen,setSwitcherOpen]=useState(false);
 const [accountOpen,setAccountOpen]=useState(false);
 useEffect(()=>{setTray(null);setMenuOpen(false);setSwitcherOpen(false);setAccountOpen(false)},[location.pathname]);
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
 async function changeSession(command:()=>Promise<void>,switching=false){
  setChanging(true);setError("");setSwitcherError("");
  try{await command()}
  catch(error){
   const message=error instanceof Error?error.message:"Unable to update your session.";
   if(switching)setSwitcherError(message);else setError(message);
   setChanging(false);
  }
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
   {current?<button type="button" aria-label="Switch workspace" disabled={changing} aria-haspopup="dialog" aria-expanded={switcherOpen} onClick={()=>{setSwitcherError("");setSwitcherOpen(true)}} className="mr-auto flex min-w-0 max-w-[min(65vw,22rem)] items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <span className="shrink-0 font-serif text-lg font-semibold">CAN OS</span><span className="min-w-0 border-l pl-2"><span className="block text-xs font-semibold capitalize">{current.role.replaceAll("_"," ")}</span><span className="block truncate text-xs text-muted-foreground">{authenticated?.sites.length===1?authenticated.sites[0]?.name:authenticated?.sites.length?authenticated.sites.length+" schools":"Your workspace"}</span></span><ChevronDown className="size-4 shrink-0" aria-hidden="true"/>
   </button>:<Link to="/" className="mr-auto font-serif text-xl font-semibold">CAN OS</Link>}
   {current&&<button type="button" aria-label="Search or ask CAN" onClick={()=>window.dispatchEvent(new Event(openPaletteEvent))} className="rounded-lg border px-3 py-2 text-xs"><Search className="mr-1 inline size-3"/> <span className="hidden sm:inline">Search or ask CAN</span><span className="sm:hidden">Search</span></button>}
   {current&&<button type="button" onClick={()=>setTray("ask")} aria-label="Ask CAN" aria-haspopup="dialog" className="rounded-lg border p-2 text-xs"><MessageCircle className="size-4" aria-hidden="true"/></button>}
   {current&&<button type="button" onClick={()=>setTray("notifications")} aria-label="Notifications" aria-haspopup="dialog" className="rounded-lg border p-2"><Bell className="size-4" aria-hidden="true"/></button>}
   {authenticated?<button type="button" aria-label="Account menu" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={()=>setAccountOpen(true)} className="rounded-full border bg-muted p-2"><UserRound className="size-4" aria-hidden="true"/></button>:session&&<Link to="/access" className="text-xs font-semibold">Sign in</Link>}
   {(error||sessionError)&&<WorkspaceNotice tone="danger" className="w-full">{error||sessionError}</WorkspaceNotice>}
   {authenticated?.demoFacilitator&&<WorkspaceNotice className="w-full">Demo admin session: acting as {current?.firstName} {current?.lastName} ({current?.role}). Changes affect shared synthetic data. User switches are audited.</WorkspaceNotice>}
  </div>
 </header>{children}</div></div>
 {authenticated&&<><WorkspaceContextSwitcher session={authenticated} open={switcherOpen} changing={changing}
  error={switcherError} onClose={()=>setSwitcherOpen(false)}
  onSwitch={id=>void changeSession(()=>switchGrant(id),true)}/>
 <ContextTray title="Account" open={accountOpen} onClose={()=>setAccountOpen(false)}>
  <div className="space-y-2 text-sm"><Link to="/profiles" onClick={()=>setAccountOpen(false)} className="block rounded-lg p-3 hover:bg-muted">My profile</Link><Link to="/account/sessions" onClick={()=>setAccountOpen(false)} className="block rounded-lg p-3 hover:bg-muted">Account sessions</Link>{current?.role==="student"&&<Link to="/student/settings" onClick={()=>setAccountOpen(false)} className="block rounded-lg p-3 hover:bg-muted">Account settings</Link>}<button type="button" disabled={changing} onClick={()=>void changeSession(signOut)} className="block w-full rounded-lg p-3 text-left font-semibold hover:bg-muted">Sign out</button></div>
 </ContextTray></>}
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
