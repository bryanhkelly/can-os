import {usePrivateReportQuery} from "./use-private-report-query";
import {useReportGeography} from "./use-report-geography";
import {getProviderReportSites} from "@/modules/reporting/provider-report-sites.functions";
import {hasGeographyFilterOption} from "@/domain/geographic-reporting";
import {reportSiteSelectionAvailable,type ProviderReportFilters,type ReportGeographyBasis} from "@/domain/report-filter-state";
export function useProviderReportOptions(scope:string|null,basis:ReportGeographyBasis,filters:ProviderReportFilters){
  const geography=useReportGeography(scope,basis);
  const sites=usePrivateReportQuery({scope,key:["provider-report-site-options"],read:()=>getProviderReportSites()});
  // All-geography/all-Site reads need not depend on optional discovery. A
  // concrete choice must remain verified; an error or stale choice never widens.
  const geographyReady=!filters.geography||!!geography.data&&hasGeographyFilterOption(filters.geography,geography.data);
  const siteReady=!filters.siteId||!!sites.data&&reportSiteSelectionAvailable(filters.siteId,sites.data);
  const pending=!!filters.geography&&(geography.query.isPending||geography.query.isFetching)||
    !!filters.siteId&&(sites.query.isPending||sites.query.isFetching);
  return {geography,sites,ready:scope!==null&&geographyReady&&siteReady,pending,
    retry:()=>{void geography.query.refetch();void sites.query.refetch();}};
}
