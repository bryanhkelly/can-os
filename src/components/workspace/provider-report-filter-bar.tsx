import {Button} from "@/components/ui/button";
import {ReportGeographyFilter} from "./report-geography-filter";
import {ReportSiteFilter} from "./report-site-filter";
import {WorkspaceNotice} from "./notice";
import type {GeographyFilterOption} from "@/domain/geographic-reporting";
import type {ProviderReportFilters,ProviderFilterAction,ReportSiteOption,ReportGeographyBasis} from "@/domain/report-filter-state";
type Options<T>={data:readonly T[];loading:boolean;error:boolean};
export function ProviderReportFilterBar({filters,dispatch,basis,geography,sites,ready,pending,onRetry}:{
  filters:ProviderReportFilters;dispatch:(action:ProviderFilterAction)=>void;basis:ReportGeographyBasis;
  geography:Options<GeographyFilterOption>;sites:Options<ReportSiteOption>;ready:boolean;pending:boolean;onRetry:()=>void;
}){
  return <div className="min-w-0 space-y-3 border border-border bg-card p-4" aria-label="Provider report filters" role="group">
    <div className="grid gap-4 md:grid-cols-2">
      <ReportGeographyFilter value={filters.geography} options={geography.data} basis={basis} loading={geography.loading} error={geography.error}
        onChange={value=>dispatch({type:"geography",value})}/>
      <ReportSiteFilter value={filters.siteId} options={sites.data} loading={sites.loading} error={sites.error}
        onChange={value=>dispatch({type:"site",value})}/>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {(filters.geography||filters.siteId)&&<Button type="button" size="sm" variant="outline" onClick={()=>{dispatch({type:"geography",value:""});dispatch({type:"site",value:""});}}>Clear geography and Site</Button>}
      {(geography.error||sites.error||!ready&&!pending)&&<Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry filter options</Button>}
    </div>
    {!ready&&<WorkspaceNotice tone={pending?"info":"attention"}>{pending?"Verifying selected filters…":"The selected filters cannot be verified. No report results are shown until the selection is available or explicitly cleared."}</WorkspaceNotice>}
  </div>;
}
