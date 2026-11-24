import {useQuery} from "@tanstack/react-query";
import {useWorkspaceSession,workspaceSessionIdentity} from "@/components/shell/WorkspaceSession";

/** Browser cache segregation is defense in depth, never a substitute for server grants.
 * No previous-scope placeholder, stale-on-error rendering or persistent cache.
 */
export function usePrivateReportScope(){
  const session=useWorkspaceSession();
  return session.session?.authenticated&&!session.error?workspaceSessionIdentity(session):null;
}
export function usePrivateReportQuery<T>(options:{
  scope:string|null;key:readonly (string|number|null)[];read:()=>Promise<T>;enabled?:boolean;
}){
  const enabled=options.scope!==null&&options.enabled!==false;
  const query=useQuery<T>({
    queryKey:["private-report",options.scope,...options.key],
    queryFn:()=>{if(!enabled)throw Error("Private report scope or selection unavailable");return options.read();},enabled,retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",
  });
  return {query,data:enabled&&!query.isError&&!query.isFetching&&!query.isPlaceholderData?query.data:undefined};
}
