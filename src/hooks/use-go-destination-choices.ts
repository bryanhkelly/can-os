import type {GoDestinationChoice} from "@/domain/site-go-links";
import {usePrivateWorkspaceScope,usePrivateWorkspaceQuery} from "./use-private-workspace-query";

/** Shared private catalog read. The server separately authorizes reads and issuance. */
export function useGoDestinationChoices(key:readonly (string|null)[],read:()=>Promise<readonly GoDestinationChoice[]>){
  const scope=usePrivateWorkspaceScope();
  const {query,data}=usePrivateWorkspaceQuery({namespace:"go-destination-choices",scope,key,read,refetchOnWindowFocus:false});
  const loading=scope!==null&&(query.isPending||query.isFetching);
  const error=scope===null||query.isError;
  return {choices:data??[],loading,error,retry:()=>{if(scope!==null)void query.refetch();}};
}
