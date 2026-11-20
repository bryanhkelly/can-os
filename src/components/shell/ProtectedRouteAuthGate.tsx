import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceSession } from "./WorkspaceSession";
import { getWorkspaceSession } from "@/modules/identity/workspace-session.functions";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { isPublicCanPath } from "@/domain/auth-route-policy";

/** Global browser guard in addition to the root's initial server redirect.
 * Private page services retain their own database/session authorization.
 */
export function ProtectedRouteAuthGate({ children }: { children: ReactNode }) {
  const location=useLocation();
  const {session,error}=useWorkspaceSession();
  const queryClient=useQueryClient();
  const lastPath=useRef(location.href);
  const publicPage=isPublicCanPath(location.pathname);
  const returnTo=accessReturnToFromLocation(location);

  useEffect(()=>{
    // Verify the active server session on each client-side page transition,
    // not only when a particular route has remembered to add an auth loader.
    if(lastPath.current===location.href)return;
    lastPath.current=location.href;
    if(isPublicCanPath(location.pathname))return;
    let cancelled=false;
    void getWorkspaceSession().then(result=>{
      if(!cancelled)queryClient.setQueryData(["workspace-session"],result);
    }).catch(()=>{
      // Network loss is not evidence that a session has expired.
    });
    return()=>{cancelled=true;};
  },[location.href,location.pathname,queryClient]);

  if(!publicPage && !error && !session?.authenticated) {
    return <Navigate to="/access" search={{returnTo}} replace />;
  }
  return children;
}
