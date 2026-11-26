import {useState} from "react";
import {Button} from "@/components/ui/button";
import {WorkspacePanel,QueryState} from "@/components/workspace";
import {NetworkReportingReadinessView} from "./NetworkReportingReadinessView";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {getNetworkReportingReadiness} from "@/modules/insights/network-reporting-readiness.functions";
function Readiness({scope}:{scope:string}){
  const {query,data}=usePrivateReportQuery({scope,key:["network-reporting-readiness"],read:()=>getNetworkReportingReadiness()});

  return <div className="space-y-4">
    <QueryState loading={query.isFetching||query.isPending?"Checking network reporting setup…":undefined}
      error={query.isError?"Reporting setup is unavailable. A current independently verified HQ account and agreement are required.":undefined}
      onRetry={()=>void query.refetch()}>
      {data&&<>
        <NetworkReportingReadinessView data={data}/>
        <Button type="button" size="sm" variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Refresh setup inventory</Button>
      </>}
    </QueryState>
  </div>;
}
export function NetworkReportingReadinessPanel(){
  const scope=usePrivateReportScope();
  const [open,setOpen]=useState(false);
  if(!scope)return null;
  return <WorkspacePanel title="National and jurisdictional reporting"
    description="Review readiness for independently authorized aggregate reporting across network members."
    className="mt-8" id="network-reporting">
    <div className="space-y-4">
      <Button type="button" variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
        {open?"Close reporting readiness":"View reporting readiness"}
      </Button>
      {open&&<Readiness key={scope} scope={scope}/>}
    </div>
  </WorkspacePanel>;
}
