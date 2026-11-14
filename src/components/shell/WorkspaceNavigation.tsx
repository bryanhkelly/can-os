import { mutationErrorMessage } from "@/lib/mutation-feedback";
import {useLocation} from "@tanstack/react-router";
import {useEffect,useState,useSyncExternalStore,type ReactNode} from "react";
import {openPaletteEvent} from "@/lib/workspace-search";
import {WorkspaceContextSwitcher} from "./WorkspaceContextSwitcher";
import {useWorkspaceSession} from "./WorkspaceSession";
import {getActiveWorkspacePath,getWorkspaceLinks,isFocusedClassroomRoute,resolveWorkspaceInstitutionSelection,type WorkspaceInstitutionSelection} from "./workspace-navigation.registry";
import {WorkspaceSidebar} from "./WorkspaceSidebar";
import {WorkspaceTopBar} from "./WorkspaceTopBar";
import {WorkspaceNavigationPanels} from "./WorkspaceNavigationPanels";
import {useQueryClient} from "@tanstack/react-query";
import {switchVerifiedMembership} from "@/lib/workspace-membership-switch";

export {SidebarLinks} from "./WorkspaceSidebarLinks";
export {workspaceHome,workspaceLinks} from "./workspace-navigation.registry";

// Presentation-only desktop sidebar preference. The server snapshot is "expanded" so
// SSR markup is stable; the stored value applies after hydration.
const sidebarPreferenceKey="can-os:sidebar";
const sidebarListeners=new Set<()=>void>();
let sidebarMemory=false;
function readSidebarCollapsed(){
 try{return window.localStorage.getItem(sidebarPreferenceKey)==="collapsed"}catch{return sidebarMemory}
}
function writeSidebarCollapsed(collapsed:boolean){
 sidebarMemory=collapsed;
 try{window.localStorage.setItem(sidebarPreferenceKey,collapsed?"collapsed":"expanded")}catch{/* storage unavailable */}
 sidebarListeners.forEach(listener=>listener());
}
function subscribeSidebarPreference(listener:()=>void){
 sidebarListeners.add(listener);
 const onStorage=(event:StorageEvent)=>{if(event.key===sidebarPreferenceKey)listener()};
 window.addEventListener("storage",onStorage);
 return()=>{sidebarListeners.delete(listener);window.removeEventListener("storage",onStorage)};
}

export function WorkspaceNavigation({children}:{children?:ReactNode}){
 const location=useLocation();
 const queryClient=useQueryClient();
 const {session,error:sessionError}=useWorkspaceSession();
 const [error,setError]=useState("");
 const [switcherError,setSwitcherError]=useState("");
 const [changing,setChanging]=useState(false);
 const [tray,setTray]=useState<"notifications"|"ask"|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [switcherOpen,setSwitcherOpen]=useState(false);
 const [accountOpen,setAccountOpen]=useState(false);
 const [sidebarExpanded,setSidebarExpanded]=useState(false);
 const [institutionSelection,setInstitutionSelection]=useState<WorkspaceInstitutionSelection>({});
 const sidebarCollapsed=useSyncExternalStore(subscribeSidebarPreference,readSidebarCollapsed,()=>false);
 const toggleSidebarCollapsed=()=>writeSidebarCollapsed(!sidebarCollapsed);
 const focusedClassroom=isFocusedClassroomRoute(location.pathname,location.searchStr,
  session?.authenticated?session.role:null);
 useEffect(()=>{setTray(null);setMenuOpen(false);setSwitcherOpen(false);setAccountOpen(false)},[location.pathname]);
 const authenticated=session?.authenticated?session:null;
 // Each grant retains its own navigation selection after hydration; never
 // persist or reapply another grant's Site or Program, even in a demo account.
 useEffect(()=>{
   if(!authenticated) {
     setInstitutionSelection(previous=>Object.keys(previous).length ? {} : previous);
     return;
   }
   const key="can-os:institution:"+authenticated.activeGrantId;
   let stored: WorkspaceInstitutionSelection={};
   try {
     const raw=window.sessionStorage.getItem(key);
     if(raw && raw.length<256) {
       const value=JSON.parse(raw) as Record<string,unknown>;
       if(value && typeof value==="object" && !Array.isArray(value)) {
         stored={
           ...(typeof value.siteId==="string"?{siteId:value.siteId}:{}),
           ...(typeof value.programId==="string"?{programId:value.programId}:{}),
         };
       }
     }
   }catch{/* Session storage unavailable. URL and verified grants remain sufficient. */}
   const next=resolveWorkspaceInstitutionSelection(
     location.searchStr,stored,authenticated.sites,authenticated.programs,
   );
   setInstitutionSelection(previous=>
     previous.siteId===next.siteId && previous.programId===next.programId ? previous : next);
   try{window.sessionStorage.setItem(key,JSON.stringify(next));}catch{/* Storage is optional. */}
 },[authenticated,location.searchStr]);
 const preferences=authenticated?.role==="student"?authenticated.studentPreferences:undefined;
 const grants=authenticated?.grants??[];
 const current=grants.find(g=>g.id===authenticated?.activeGrantId);
 const links=current?(getWorkspaceLinks(current.role)??[]):[];
 const activePath=getActiveWorkspacePath(links,location.pathname);
 const switchGrant=async(id:string)=>{
    if(!authenticated)throw new Error("Sign in to change membership.");
    await switchVerifiedMembership({grants,activeGrantId:authenticated.activeGrantId,grantId:id,queryClient});
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
 <div data-sidebar={current&&!focusedClassroom&&sidebarCollapsed?"collapsed":undefined} className={current ? focusedClassroom ? `classroom-navigation ${sidebarExpanded ? "classroom-navigation-expanded" : ""}` : "can-shell" : "min-h-screen"}>
 {current&&<WorkspaceSidebar member={current} links={links} activePath={activePath} institutionSelection={institutionSelection}
  focused={focusedClassroom} expanded={focusedClassroom?sidebarExpanded:!sidebarCollapsed}
  onToggle={focusedClassroom?()=>setSidebarExpanded(value=>!value):toggleSidebarCollapsed}/>}
 <div className="min-w-0"><WorkspaceTopBar member={current} sites={authenticated?.sites??[]} authenticated={Boolean(authenticated)}
  sessionAvailable={Boolean(session)} sessionError={sessionError} error={error}
  demoAccountSwitching={authenticated?.demoAccountSwitching===true} changing={changing}
  demoTenant={authenticated?.demoTenant===true}
  focused={focusedClassroom}
  menuOpen={menuOpen} switcherOpen={switcherOpen} accountOpen={accountOpen} notificationsOpen={tray==="notifications"}
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
  onCloseMenu={()=>setMenuOpen(false)} links={links} activePath={activePath} institutionSelection={institutionSelection}
  tray={tray} onCloseTray={()=>setTray(null)}/>
 </div>;
}
