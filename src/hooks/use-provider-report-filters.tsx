import {createContext,useContext,useState,type ReactNode} from "react";
import {initialProviderReportFilters,updateProviderReportFilters,type ProviderFilterAction,type ProviderReportFilters} from "@/domain/report-filter-state";
type Controller={scope:string|null;filters:ProviderReportFilters;dispatch:(action:ProviderFilterAction)=>void};
const Context=createContext<Controller|null>(null);
export function useStandaloneProviderReportFilters(scope:string|null):Controller{
  const [stored,setStored]=useState(()=>({scope,filters:initialProviderReportFilters(new Date())}));
  // Reset synchronously on identity change, including logout. No old selections
  // survive switching away and back to the same workspace grant.
  const current=stored.scope===scope?stored:{scope,filters:initialProviderReportFilters(new Date())};
  if(stored.scope!==scope)setStored(current);
  return {scope,filters:current.filters,dispatch:action=>{
    setStored(prior=>prior.scope===scope?{scope,filters:updateProviderReportFilters(prior.filters,action)}:prior);
  }};
}
export function ProviderReportFilterProvider({scope,children}:{scope:string;children:ReactNode}){
  const controller=useStandaloneProviderReportFilters(scope);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
/** A standalone report still owns scope-keyed selection state. A context
 * cannot be consumed across different verified workspace identities. */
export function useProviderReportFilters(scope:string|null){
  const shared=useContext(Context);
  const local=useStandaloneProviderReportFilters(scope);
  return shared&&scope!==null&&shared.scope===scope?shared:local;
}
