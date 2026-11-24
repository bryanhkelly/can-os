import {ProviderReportFilterBar} from "@/components/workspace/provider-report-filter-bar";
import type {useProviderReportOptions} from "@/hooks/use-provider-report-options";
import type {useProviderReportFilters} from "@/hooks/use-provider-report-filters";
import type {ReportGeographyBasis} from "@/domain/report-filter-state";
/** Thin feature composition; the shared presentation never imports queries. */
export function ProviderReportFilters({controller,options,basis}:{
 controller:ReturnType<typeof useProviderReportFilters>;options:ReturnType<typeof useProviderReportOptions>;basis:ReportGeographyBasis;
}){
 return <ProviderReportFilterBar filters={controller.filters} dispatch={controller.dispatch} basis={basis}
   geography={{data:options.geography.data??[],loading:options.geography.query.isFetching,error:options.geography.query.isError}}
   sites={{data:options.sites.data??[],loading:options.sites.query.isFetching,error:options.sites.query.isError}}
   ready={options.ready} pending={options.pending} onRetry={options.retry}/>;
}
