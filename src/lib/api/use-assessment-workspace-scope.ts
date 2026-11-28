import {useContext} from "react";
import {WorkspaceSessionContext} from "@/components/shell/workspace-session-context";
import {workspaceApiScope} from "./workspace-query-scope";
/** Cache identity is not authorization. All API calls independently verify the session. */
export function useAssessmentWorkspaceScope(){
 const session=useContext(WorkspaceSessionContext)?.session;
 if(!session?.authenticated)return null;
 try{return workspaceApiScope(session);}catch{return null;}
}
