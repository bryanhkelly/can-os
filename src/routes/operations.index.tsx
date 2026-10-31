import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { getLaunchEntry } from "@/modules/programs/launch.functions";
import { getReleaseHealth } from "@/modules/operations/release-health.functions";
import { getOperationsActions } from "@/modules/operations/action-workspace.functions";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";

export const Route = createFileRoute("/operations/")({
 validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;action?:string}=>({
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
  action:typeof search.action==="string"?search.action:undefined,
 }),
 beforeLoad:async({search})=>{
  if(search.action)return;
  const entry=await getLaunchEntry({data:{siteId:search.siteId,programId:search.programId}}).catch(()=>null);
  if(entry)throw redirect({to:"/operations/launch",search:entry,replace:true});
 },
 loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId}),
 loader:async({deps})=>{
  try{
   return {operations:await getOperationsActions({data:deps}),health:await getReleaseHealth(),commandCenter:await getLiveOperationsCommandCenter({data:deps}).catch(()=>null),dashboard:await getLiveFullFlowOperations({data:deps}).catch(()=>null),launches:await import("@/modules/programs/launch.functions").then(module=>module.listLaunches()).catch(()=>null),authError:""};
  }catch{
   return {operations:null,health:null,commandCenter:null,dashboard:null,launches:null,authError:"Sign in with an authorized staff account to view school operations."};
  }
 },
 component: () => <OperationsWorkspace data={Route.useLoaderData()} selected={Route.useSearch()} />,
});
