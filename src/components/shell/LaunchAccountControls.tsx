import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useWorkspaceSession } from "./workspace-session-context";
import { WorkspaceAccountMenu, WorkspaceAccountTrigger } from "./WorkspaceAccountMenu";
import { signOutOfWorkspace } from "./workspace-sign-out";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

/** Reuses CAN OS's verified Account drawer and the same session-revoking sign out
 * on standalone Launch Studio screens, without installing a second top bar.
 */
export function LaunchAccountControls() {
  const {session}=useWorkspaceSession();
  const pathname=useLocation({select: location => location.pathname});
  const [accountOpen,setAccountOpen]=useState(false);
  const [changing,setChanging]=useState(false);
  const [error,setError]=useState("");
  const authenticated=session?.authenticated===true;
  const member=authenticated
    ?session.grants.find(grant=>grant.id===session.activeGrantId)
    :undefined;

  useEffect(()=>{
    setAccountOpen(false);
    setError("");
  },[pathname]);

  async function signOut() {
    if(changing)return;
    setChanging(true);
    setError("");
    try {
      await signOutOfWorkspace();
    } catch(failure) {
      setError(mutationErrorMessage(failure,"Unable to sign out. Please try again."));
      setChanging(false);
    }
  }
  if(!authenticated)return null;
  return <div className="shrink-0">
    <WorkspaceAccountTrigger member={member} accountOpen={accountOpen}
      onOpenAccount={()=>{setError("");setAccountOpen(true);}} />
    <WorkspaceAccountMenu member={member} accountOpen={accountOpen}
      onCloseAccount={()=>setAccountOpen(false)}
      changing={changing} onSignOut={()=>void signOut()} error={error}/>
  </div>;
}
