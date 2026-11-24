import {usePrivateWorkspaceScope,usePrivateWorkspaceQuery} from "./use-private-workspace-query";

/** Preserve the report namespace and existing call sites. */
export const usePrivateReportScope=usePrivateWorkspaceScope;
export function usePrivateReportQuery<T>(options:{
  scope:string|null;key:readonly (string|number|null)[];read:()=>Promise<T>;enabled?:boolean;
}){
  return usePrivateWorkspaceQuery({...options,namespace:"private-report"});
}
