import {describe,it,expect} from "vitest";
import {
  authorizeNetworkMetricScope,assertPublishedReportDisclosure,
  type NetworkReportGrant,
} from "@/domain/network-reporting-authorization";
const at="2026-11-16T21:00:00Z";
const reader={networkOrganizationId:"network",actorPersonId:"reporter",
  currentNetworkReportCapability:true};
const grant:NetworkReportGrant={
 id:"grantA",networkOrganizationId:"network",hostOrganizationId:"site-operator-A",
 allowedMetrics:["registrations","verifiedAttendance"],
 validFrom:"2026-11-01T00:00:00Z",validThrough:null,
 revokedAt:null,evidenceVersionId:"evidence",
};
describe("WS6 independent network reporting grant policy",()=>{
 it("allows only explicitly consented host and metric pairs",()=>{
   expect(authorizeNetworkMetricScope(reader,[grant],{
     hostOrganizationIds:["site-operator-A"],metricKeys:["registrations"],
     asOf:at,
   }).grantIds).toEqual(["grantA"]);
 });
 it("denies a second independent host without its own grant",()=>{
   expect(()=>authorizeNetworkMetricScope(reader,[grant],{
     hostOrganizationIds:["site-operator-A","site-operator-B"],
     metricKeys:["registrations"],asOf:at,
   })).toThrow("host-by-metric");
 });
 it("denies disallowed metrics and another network's grants",()=>{
   expect(()=>authorizeNetworkMetricScope(reader,[grant],{
     hostOrganizationIds:["site-operator-A"],metricKeys:["personLevelExport"],asOf:at,
   })).toThrow("host-by-metric");
   expect(()=>authorizeNetworkMetricScope({...reader,networkOrganizationId:"other"},[grant],{
     hostOrganizationIds:["site-operator-A"],metricKeys:["registrations"],asOf:at,
   })).toThrow("host-by-metric");
 });
 it("fails closed for revoked, expired, future or missing-evidence grants",()=>{
   for(const invalid of [
     {...grant,revokedAt:"2026-11-15T00:00:00Z"},
     {...grant,validThrough:"2026-11-15T00:00:00Z"},
     {...grant,validFrom:"2026-11-17T00:00:00Z"},
     {...grant,evidenceVersionId:""},
   ]){
     expect(()=>authorizeNetworkMetricScope(reader,[invalid],{
       hostOrganizationIds:["site-operator-A"],metricKeys:["registrations"],asOf:at,
     })).toThrow("host-by-metric");
   }
 });
 it("network membership or unverified role never supplies grant capability",()=>{
   expect(()=>authorizeNetworkMetricScope({...reader,currentNetworkReportCapability:false},[grant],{
     hostOrganizationIds:["site-operator-A"],metricKeys:["registrations"],asOf:at,
   })).toThrow("principal");
 });
 it("denies publication without exact-audience differencing review",()=>{
   const scope={scopeDigest:"sha256:report-v1",audience:"external",asOf:at};
   const approval={
     approvalId:"approval",approvedAt:"2026-11-16T12:00:00Z",
     expiresAt:"2026-12-01T00:00:00Z",queryScopeDigest:scope.scopeDigest,
     approvedAudience:"external",suppressSmallCells:true,
     reviewedOverlappingCuts:true,reviewedHistoricalDifferencing:true,
   };
   expect(()=>assertPublishedReportDisclosure(approval,scope)).not.toThrow();
   expect(()=>assertPublishedReportDisclosure({...approval,reviewedHistoricalDifferencing:false},scope)).toThrow();
   expect(()=>assertPublishedReportDisclosure({...approval,approvedAudience:"internal"},scope)).toThrow();
   expect(()=>assertPublishedReportDisclosure({...approval,queryScopeDigest:"other"},scope)).toThrow();
   expect(()=>assertPublishedReportDisclosure(null,scope)).toThrow();
 });
});
