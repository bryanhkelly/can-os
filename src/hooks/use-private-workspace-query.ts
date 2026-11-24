import {useQuery} from "@tanstack/react-query";
import {useWorkspaceSession,workspaceSessionIdentity} from "@/components/shell/WorkspaceSession";

/** Cache isolation is defense in depth, not a substitute for server grants. */
export function usePrivateWorkspaceScope(){
  const session=useWorkspaceSession();
  return session.session?.authenticated&&!session.error?workspaceSessionIdentity(session):null;
}
export function usePrivateWorkspaceQuery<T>(options:{
  namespace:string;scope:string|null;key:readonly (string|number|null)[];
  read:()=>Promise<T>;enabled?:boolean;refetchOnWindowFocus?:boolean;
}){
  const enabled=options.scope!==null&&options.enabled!==false;
  const query=useQuery<T>({
    queryKey:[options.namespace,options.scope,...options.key],
    queryFn:()=>{if(!enabled)throw Error("Private workspace scope or selection unavailable");return options.read();},
    enabled,retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",
    ...(options.refetchOnWindowFocus===undefined?{}:{refetchOnWindowFocus:options.refetchOnWindowFocus}),
  });
  // No previous-scope placeholder, stale-on-error or stale-while-refreshing display.
  return {query,data:enabled&&!query.isError&&!query.isFetching&&!query.isPlaceholderData?query.data:undefined};
}
