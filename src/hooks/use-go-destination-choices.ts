import {useQuery} from "@tanstack/react-query";
import type {GoDestinationChoice} from "@/domain/site-go-links";
import {useWorkspaceSession,workspaceSessionIdentity} from "@/components/shell/WorkspaceSession";

/** Shared private catalog read. A prior scope, search, or failed refresh never supplies choices.
 * The server separately authorizes every catalog read and every issuance. */
export function useGoDestinationChoices(key:readonly (string|null)[],read:()=>Promise<readonly GoDestinationChoice[]>){
  const session=useWorkspaceSession();
  const scope=session.session?.authenticated&&!session.error?workspaceSessionIdentity(session):null;
  const query=useQuery({
    queryKey:["go-destination-choices",scope,...key],
    queryFn:()=>{if(scope===null)throw Error("Verified workspace required");return read();},
    enabled:scope!==null,retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",
    refetchOnWindowFocus:false,
  });
  const loading=scope!==null&&(query.isPending||query.isFetching);
  const error=scope===null||query.isError;
  const choices=loading||error||query.isPlaceholderData?[]:query.data??[];
  return {choices,loading,error,retry:()=>{if(scope!==null)void query.refetch();}};
}
