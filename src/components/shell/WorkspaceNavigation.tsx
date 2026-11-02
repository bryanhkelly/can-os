import {Link,useLocation} from "@tanstack/react-router";
import {lazy,Suspense,useEffect,useState,type ReactNode} from "react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {ContextTray} from "@/components/workspace";
import {Button} from "@/components/ui/button";
import {WorkspaceContextSwitcher} from "./WorkspaceContextSwitcher";
import {useWorkspaceSession} from "./WorkspaceSession";
import {getActiveWorkspacePath,getWorkspaceHome,getWorkspaceLinks} from "./workspace-navigation.registry";
import {SidebarLinks} from "./WorkspaceSidebarLinks";
import {WorkspaceSidebar} from "./WorkspaceSidebar";
import {WorkspaceTopBar} from "./WorkspaceTopBar";

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
 {current&&<WorkspaceSidebar member={current} sites={authenticated?.sites??[]} links={links} activePath={activePath}/>}
 <div className="min-w-0"><WorkspaceTopBar member={current} sites={authenticated?.sites??[]} authenticated={Boolean(authenticated)}
  sessionAvailable={Boolean(session)} sessionError={sessionError} error={error}
  demoAccountSwitching={authenticated?.demoAccountSwitching===true} changing={changing}
  menuOpen={menuOpen} switcherOpen={switcherOpen} accountOpen={accountOpen}
  onToggleMenu={()=>setMenuOpen(value=>!value)}
  onOpenSwitcher={()=>{setSwitcherError("");setSwitcherOpen(true)}}
  onOpenSearch={()=>window.dispatchEvent(new Event(openPaletteEvent))}
  onOpenAsk={()=>setTray("ask")} onOpenNotifications={()=>setTray("notifications")}
  onOpenAccount={()=>setAccountOpen(true)}/>{children}</div></div>
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
