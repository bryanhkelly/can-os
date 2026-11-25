import {previousCompleteUtcDays,resolveReportDateRange,type ReportDateRange} from "./report-date-range";
export const REPORT_FILTER_CONTRACT_VERSION=1 as const;
export type ReportSiteOption={id:string;label:string};
export type ProviderReportId="provider-delivery"|"noncredit-registration-outcomes";
export type ReportGeographyBasis="current"|"historical";
export type ProviderReportFilters={
  version:1;geography:string;siteId:string;
  outcomePeriod:{mode:"rolling"|"closed";range:ReportDateRange};
};
export const PROVIDER_REPORT_FILTER_CAPABILITIES={
  "provider-delivery":{geographyBasis:"current",site:"authorized_slice",period:"lifetime_current"},
  "noncredit-registration-outcomes":{geographyBasis:"historical",site:"source_projection",period:"rolling_or_closed"},
} as const;
export function initialProviderReportFilters(now:Date):ProviderReportFilters{
  return {version:1,geography:"",siteId:"",outcomePeriod:{mode:"rolling",range:previousCompleteUtcDays(90,now)}};
}
export type ProviderFilterAction=
 |{type:"geography";value:string}|{type:"site";value:string}|{type:"closed";range:ReportDateRange}|{type:"rolling"}|{type:"reset";now:Date};
/** Independent filters compose by intersection; selecting geography never silently
 * clears a narrower Site or changes a closed reporting period. */
export function updateProviderReportFilters(state:ProviderReportFilters,action:ProviderFilterAction):ProviderReportFilters{
  switch(action.type){
    case "geography":return {...state,geography:action.value};
    case "site":return {...state,siteId:action.value};
    case "closed":return {...state,outcomePeriod:{mode:"closed",range:{...action.range}}};
    case "rolling":return {...state,outcomePeriod:{...state.outcomePeriod,mode:"rolling"}};
    case "reset":return initialProviderReportFilters(action.now);
  }
}
export function reportSiteSelectionAvailable(siteId:string,options:readonly ReportSiteOption[]){
  return siteId===""||options.some(option=>option.id===siteId);
}
export function authorizedReportSite(siteId:string|undefined,allowedSiteIds:readonly string[]){
  if(!siteId)return null;
  if(!allowedSiteIds.includes(siteId))throw new Error("Selected Site is unavailable in the authorized report scope");
  return siteId;
}
export function providerDeliveryQueryKey(geography:string){
  return ["provider-delivery",geography] as const;
}
export function resolveProviderOutcomeSelection(filters:ProviderReportFilters,now:Date){
  const rolling=filters.outcomePeriod.mode==="rolling";
  const period=rolling?null:resolveReportDateRange(filters.outcomePeriod.range,366,now);
  return {valid:rolling||period!==null,rolling,
    key:["noncredit-registration-outcomes",rolling?"rolling-90-days":"closed-utc",period?.from??null,period?.to??null,filters.geography,filters.siteId||null] as const,
    input:{...(period??{}),geography:filters.geography,...(filters.siteId?{siteId:filters.siteId}:{})}};
}
/** Narrow only the final already-authorized fact cohort. Feedback ambiguity and
 * completion authority must be resolved against the wider source cohort first. */
export function selectProviderOutcomeCohort<T extends {siteId:string;geographyMatches:boolean}>(rows:readonly T[],siteId:string|null){
  return rows.filter(row=>row.geographyMatches&&(!siteId||row.siteId===siteId));
}
