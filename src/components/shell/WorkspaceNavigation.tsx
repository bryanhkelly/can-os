import { mutationErrorMessage } from "@/lib/mutation-feedback";
import {useLocation} from "@tanstack/react-router";
import {useEffect,useState,type ReactNode} from "react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {WorkspaceContextSwitcher} from "./WorkspaceContextSwitcher";
import {useWorkspaceSession} from "./WorkspaceSession";
import {getActiveWorkspacePath,getWorkspaceHome,getWorkspaceLinks} from "./workspace-navigation.registry";
import {WorkspaceSidebar} from "./WorkspaceSidebar";
import {WorkspaceTopBar} from "./WorkspaceTopBar";
import {WorkspaceNavigationPanels} from "./WorkspaceNavigationPanels";

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
 const preferences=authenticated?.role==="student"?authenticated.studentPreferences:undefined;
 const grants=authenticated?.grants??[];
 const current=grants.find(g=>g.id===authenticated?.activeGrantId);
 const links=current?(getWorkspaceLinks(current.role)??[]):[];
 const activePath=getActiveWorkspacePath(links,location.pathname);
 const switchGrant=async(id:string)=>{
  const target=grants.find(g=>g.id===id);
  if(!target)throw new Error("This membership is unavailable.");
  const response=await fetch("/access/session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({grantId:id})});
  if(!response.ok)throw new Error("Unable to change membership");
  window.location.assign(target.role==="student"?"/":getWorkspaceHome(target.role)??"/");
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
   const message=mutationErrorMessage(error, "Unable to update your session.");
   if(switching)setSwitcherError(message);else setError(message);
   setChanging(false);
  }
 }
 return <div data-density={preferences?.density} data-reduce-motion={preferences?.reduceMotion?"true":undefined}>
 <div className={current?"min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]":"min-h-screen"}>
 {current&&<WorkspaceSidebar member={current} sites={authenticated?.sites??[]} links={links} activePath={activePath}/>}
 <div className="min-w-0"><WorkspaceTopBar member={current} sites={authenticated?.sites??[]} authenticated={Boolean(authenticated)}
  sessionAvailable={Boolean(session)} sessionError={sessionError} error={error}
  demoAccountSwitching={authenticated?.demoAccountSwitching===true} changing={changing}
  demoTenant={authenticated?.demoTenant===true}
  menuOpen={menuOpen} switcherOpen={switcherOpen} accountOpen={accountOpen}
  onToggleMenu={()=>setMenuOpen(value=>!value)}
  onOpenSwitcher={()=>{setSwitcherError("");setSwitcherOpen(true)}}
  onOpenSearch={()=>window.dispatchEvent(new Event(openPaletteEvent))}
  onOpenAsk={()=>setTray("ask")} onOpenNotifications={()=>setTray("notifications")}
  onOpenAccount={()=>setAccountOpen(true)}/>{children}</div></div>
 {authenticated&&<> <WorkspaceContextSwitcher session={authenticated} open={switcherOpen} changing={changing}
  error={switcherError} onClose={()=>setSwitcherOpen(false)}
  onSwitch={id=>void changeSession(()=>switchGrant(id),true)}/>
 </>}
 <WorkspaceNavigationPanels member={current} authenticated={Boolean(authenticated)} accountOpen={accountOpen}
  onCloseAccount={()=>setAccountOpen(false)} changing={changing}
  onSignOut={()=>void changeSession(signOut)} menuOpen={menuOpen}
  onCloseMenu={()=>setMenuOpen(false)} links={links} activePath={activePath}
  tray={tray} onCloseTray={()=>setTray(null)}/>
 </div>;
}
