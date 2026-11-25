import {describe,it,expect} from "vitest";
import {initialProviderReportFilters,updateProviderReportFilters,resolveProviderOutcomeSelection,authorizedReportSite,reportSiteSelectionAvailable,selectProviderOutcomeCohort,providerDeliveryQueryKey,PROVIDER_REPORT_FILTER_CAPABILITIES} from "@/domain/report-filter-state";
const now=new Date("2026-11-24T12:00:00Z");
describe("provider report filter contract",()=>{
 it("preserves explicit narrower selection and date mode across geography changes",()=>{
  let state=initialProviderReportFilters(now);
  state=updateProviderReportFilters(state,{type:"site",value:"site-a"});
  state=updateProviderReportFilters(state,{type:"closed",range:{fromDay:"2026-11-01",untilDay:"2026-11-15"}});
  state=updateProviderReportFilters(state,{type:"geography",value:"US-GA"});
  expect(state.siteId).toBe("site-a");
  expect(resolveProviderOutcomeSelection(state,now)).toMatchObject({valid:true,rolling:false,input:{siteId:"site-a",geography:"US-GA",from:"2026-11-01T00:00:00.000Z",to:"2026-11-15T00:00:00.000Z"}});
  expect(resolveProviderOutcomeSelection(updateProviderReportFilters(state,{type:"rolling"}),now).input).toEqual({siteId:"site-a",geography:"US-GA"});
 });
 it("separates reader capability and exact selection identity",()=>{
  const state=initialProviderReportFilters(now);
  expect(PROVIDER_REPORT_FILTER_CAPABILITIES["provider-delivery"].geographyBasis).toBe("current");
  expect(PROVIDER_REPORT_FILTER_CAPABILITIES["noncredit-registration-outcomes"].geographyBasis).toBe("historical");
  expect(providerDeliveryQueryKey("US-GA")).not.toEqual(providerDeliveryQueryKey("US-CA"));
  expect(resolveProviderOutcomeSelection({...state,siteId:"site-a"},now).key).not.toEqual(resolveProviderOutcomeSelection(state,now).key);
  expect(resolveProviderOutcomeSelection({...state,outcomePeriod:{mode:"closed",range:{fromDay:"2026-11-24",untilDay:"2026-11-25"}}},now).valid).toBe(false);
 });
 it("rejects a stale or unauthorized selected Site rather than widening",()=>{
  expect(authorizedReportSite("site-a",["site-a"])).toBe("site-a");
  expect(()=>authorizedReportSite("site-b",["site-a"])).toThrow();
  expect(authorizedReportSite(undefined,["site-a"])).toBeNull();
  expect(reportSiteSelectionAvailable("site-b",[{id:"site-a",label:"A"}])).toBe(false);
 });
 it("intersects historical geography and exact Site only at final cohort projection",()=>{
  const rows=[{id:1,siteId:"site-a",geographyMatches:true},{id:2,siteId:"site-a",geographyMatches:false},{id:3,siteId:"site-b",geographyMatches:true}];
  expect(selectProviderOutcomeCohort(rows,"site-a").map(r=>r.id)).toEqual([1]);
  expect(selectProviderOutcomeCohort(rows,null).map(r=>r.id)).toEqual([1,3]);
  expect(selectProviderOutcomeCohort(rows,"site-c")).toEqual([]);
  expect(rows).toHaveLength(3);
 });
});
