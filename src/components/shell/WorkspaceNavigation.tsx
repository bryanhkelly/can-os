import {Link,useLocation} from "@tanstack/react-router";
import {lazy,Suspense,useEffect,useState,type ReactNode} from "react";
import {Bell,MessageCircle,Search,Menu,ChevronDown,UserRound,Users,Settings} from "lucide-react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {ContextTray,WorkspaceNotice} from "@/components/workspace";
import {Button} from "@/components/ui/button";
import {WorkspaceContextSwitcher} from "./WorkspaceContextSwitcher";
import {useWorkspaceSession} from "./WorkspaceSession";
import {getActiveWorkspacePath,getWorkspaceHome,getWorkspaceLinks} from "./workspace-navigation.registry";
import {SidebarLinks} from "./WorkspaceSidebarLinks";

const NotificationTray=lazy(()=>import("./NotificationTray").then(module=>({default:module.NotificationTray})));
const AskCanConversation=lazy(()=>import("@/components/conversation/AskCanConversation").then(module=>({default:module.AskCanConversation})));
const focusRingClass="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export {SidebarLinks} from "./WorkspaceSidebarLinks";
export {workspaceHome,workspaceLinks} from "./workspace-navigation.registry";

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
 const links=current?(getWorkspaceLinks(current.role)??[]):[];
 const activePath=getActiveWorkspacePath(links,location.pathname);
 const switchGrant=async(id:string)=>{
  const target=grants.find(g=>g.id===id);
  if(!target)throw new Error("This membership is unavailable.");
  const response=await fetch("/access/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId:id})});
  if(!response.ok)throw new Error("Unable to change membership");
  window.location.assign(getWorkspaceHome(target.role)??"/");
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
  <div className="border-b p-5"><Link to={getWorkspaceHome(current.role)??"/"} className={"rounded-sm font-serif text-xl font-semibold "+focusRingClass}>CAN OS</Link><p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Church Academy Network</p></div>
  <div className="p-4"><p className="text-xs uppercase tracking-widest text-muted-foreground">{current.role} workspace</p><p className="mt-2 text-sm font-semibold">{current.firstName} {current.lastName}</p>
   <p className="mt-1 text-xs text-muted-foreground">{authenticated?.sites.map(site=>site.name).join(", ")}</p></div>
  <SidebarLinks links={links} activePath={activePath}/>
  <div className="border-t p-4"><Link to="/profiles" className={"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted "+focusRingClass}><Users className="size-4" aria-hidden="true"/>My profile</Link>
   <Link to="/account/sessions" className={"flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted "+focusRingClass}><Settings className="size-4" aria-hidden="true"/>Account sessions</Link>
   {current.role==="student"&&<Link to="/student/settings" className={"flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted "+focusRingClass}><Settings className="size-4" aria-hidden="true"/>Preferences</Link>}</div>
 </aside>}
 <div className="min-w-0"><header aria-label="Workspace top bar" className="sticky top-0 z-30 border-b bg-card px-4 py-3 sm:px-6">
  <div className="flex min-w-0 flex-wrap items-center gap-3">
   {current&&<Button variant="outline" size="icon" aria-label={menuOpen?"Close workspace navigation":"Open workspace navigation"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)} className="lg:hidden"><Menu aria-hidden="true"/></Button>}
   {current?<button type="button" aria-label="Switch workspace" disabled={changing} aria-haspopup="dialog" aria-expanded={switcherOpen} onClick={()=>{setSwitcherError("");setSwitcherOpen(true)}} className="mr-auto flex min-w-0 max-w-[min(65vw,22rem)] items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <span className="shrink-0 font-serif text-lg font-semibold">CAN OS</span><span className="min-w-0 border-l pl-2"><span className="block text-xs font-semibold capitalize">{current.role.replaceAll("_"," ")}</span><span className="block truncate text-xs text-muted-foreground">{authenticated?.sites.length===1?authenticated.sites[0]?.name:authenticated?.sites.length?authenticated.sites.length+" schools":"Your workspace"}</span></span><ChevronDown className="size-4 shrink-0" aria-hidden="true"/>
   </button>:<Link to="/" className={"mr-auto rounded-sm font-serif text-xl font-semibold "+focusRingClass}>CAN OS</Link>}
   {current&&<Button variant="outline" size="sm" aria-label="Search or ask CAN" onClick={()=>window.dispatchEvent(new Event(openPaletteEvent))}><Search aria-hidden="true"/> <span className="hidden sm:inline">Search or ask CAN</span><span className="sm:hidden">Search</span></Button>}
   {current&&<Button variant="outline" size="icon" onClick={()=>setTray("ask")} aria-label="Ask CAN" aria-haspopup="dialog"><MessageCircle aria-hidden="true"/></Button>}
   {current&&<Button variant="outline" size="icon" onClick={()=>setTray("notifications")} aria-label="Notifications" aria-haspopup="dialog"><Bell aria-hidden="true"/></Button>}
   {authenticated?<Button variant="ghost" size="icon" aria-label="Account menu" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={()=>setAccountOpen(true)} className="rounded-full border bg-muted"><UserRound aria-hidden="true"/></Button>:session&&<Link to="/access" className={"rounded-lg px-2 py-2 text-xs font-semibold "+focusRingClass}>Sign in</Link>}
   {(error||sessionError)&&<WorkspaceNotice tone="danger" className="w-full">{error||sessionError}</WorkspaceNotice>}
   {authenticated?.demoAccountSwitching&&<WorkspaceNotice className="w-full">Demo admin session: acting as {current?.firstName} {current?.lastName} ({current?.role}). Changes affect shared demo data. User switches are audited.</WorkspaceNotice>}
  </div>
 </header>{children}</div></div>
 {authenticated&&<><WorkspaceContextSwitcher session={authenticated} open={switcherOpen} changing={changing}
  error={switcherError} onClose={()=>setSwitcherOpen(false)}
  onSwitch={id=>void changeSession(()=>switchGrant(id),true)}/>
 <ContextTray title="Account" open={accountOpen} onClose={()=>setAccountOpen(false)}>
  <div className="space-y-2 text-sm"><Link to="/profiles" onClick={()=>setAccountOpen(false)} className={"block rounded-lg p-3 hover:bg-muted "+focusRingClass}>My profile</Link><Link to="/account/sessions" onClick={()=>setAccountOpen(false)} className={"block rounded-lg p-3 hover:bg-muted "+focusRingClass}>Account sessions</Link>{current?.role==="student"&&<Link to="/student/settings" onClick={()=>setAccountOpen(false)} className={"block rounded-lg p-3 hover:bg-muted "+focusRingClass}>Account settings</Link>}<Button variant="ghost" size="sm" disabled={changing} onClick={()=>void changeSession(signOut)} className="w-full justify-start">Sign out</Button></div>
 </ContextTray></>}
 {current&&<><ContextTray title="Workspace navigation" open={menuOpen} onClose={()=>setMenuOpen(false)}>
  <p className="mb-3 text-sm font-semibold">{current.firstName} {current.lastName} · {current.role}</p>
  <SidebarLinks links={links} activePath={activePath}/><Link to="/profiles" className={"mt-3 block rounded-lg border-t p-3 text-sm underline "+focusRingClass}>My profile</Link><Link to="/account/sessions" className={"block rounded-lg p-3 text-sm underline "+focusRingClass}>Account sessions</Link>
 </ContextTray><ContextTray title="Notifications" open={tray==="notifications"} onClose={()=>setTray(null)}>
  <Suspense fallback={<p role="status">Loading notifications...</p>}><NotificationTray onNavigate={()=>setTray(null)}/></Suspense>
 </ContextTray>
 <ContextTray title="Ask CAN" open={tray==="ask"} onClose={()=>setTray(null)}>
  <p className="text-sm text-muted-foreground">Your conversations follow you between workspaces. Answers and proposed actions use your verified permissions; this page does not expand them.</p>
  <Link to="/ask" onClick={()=>setTray(null)} className={"mt-2 inline-block rounded-sm text-sm underline "+focusRingClass}>Open full conversation page</Link>
  {current.role==="guardian"&&<Link to="/guardian/watching" onClick={()=>setTray(null)} className={"ml-4 inline-block rounded-sm text-sm underline "+focusRingClass}>Things CAN Is Watching</Link>}
  <Suspense fallback={<p role="status">Loading Ask CAN...</p>}><AskCanConversation/></Suspense>
 </ContextTray></>}
 </>;
}
