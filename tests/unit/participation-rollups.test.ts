import {describe,expect,it} from "vitest";
import {
  rollupAuthorizedParticipation,assertAuthorizedReportFacts,
  type ParticipationReportingFact,
} from "@/domain/participation-rollups";
const period={from:"2026-11-01T00:00:00Z",to:"2026-12-01T00:00:00Z",
  asOf:"2026-11-16T22:00:00Z"};
const proof={verifiedOrganizationIds:new Set(["orgA"]),verifiedSiteIds:new Set(["siteA","siteB"])};
const facts:ParticipationReportingFact[]=Array.from({length:14},(_,i)=>({
 source:"native_class_enrollment",sourceId:"e"+i,personId:"p"+(i===13?0:i),
 courseVersionId:i<8?"courseOne":"courseTwo",programId:i<8?"program":"program",
 deliverySiteId:i<8?"siteA":"siteB",operatingOrganizationId:"orgA",
 creditedOrganizationId:i===13?"affiliate":null,
 registeredAt:"2026-11-06T00:00:00Z",currentStatus:i===12?"withdrawn":"active",
}));
describe("WS6 authorized multi-Site reporting",()=>{
 it("14 registrations across two Sites are 13 distinct people",()=>{
  const r=rollupAuthorizedParticipation(facts,proof,period);
  expect(r.totals).toMatchObject({registrations:14,uniquePeople:13,active:13,withdrawn:1});
  expect(r.sites.map(x=>x.registrations)).toEqual([8,6]);
  expect(r.sites.reduce((n,x)=>n+x.uniquePeople,0)).toBe(14);
  expect(r.organizations[0]?.uniquePeople).toBe(13);
 });
 it("never counts a credited affiliation as an extra registration",()=>{
  const r=rollupAuthorizedParticipation(facts,proof,period);
  expect(r.totals.registrations).toBe(14);
  expect(r.networkReportAvailable).toBe(false);
 });
 it("preserves standalone Courses without inventing Programs",()=>{
  const r=rollupAuthorizedParticipation(facts.map((f,i)=>i===0?{...f,programId:null}:f),
   proof,period);
  expect(r.courses.reduce((n,x)=>n+x.registrations,0)).toBe(14);
  expect(r.programs[0]?.registrations).toBe(13);
 });
 it("denies private facts from an ungranted independent Site or Organization",()=>{
  const badSite={...facts[0]!,deliverySiteId:"not-granted"};
  expect(()=>assertAuthorizedReportFacts([badSite],proof)).toThrow("Out-of-scope");
  const badOrg={...facts[0]!,operatingOrganizationId:"otherOrg",creditedOrganizationId:"orgA"};
  expect(()=>assertAuthorizedReportFacts([badOrg],proof)).toThrow("Out-of-scope");
 });
 it("fails closed on a duplicated source across multiple reporting dimensions",()=>{
  expect(()=>rollupAuthorizedParticipation([facts[0]!,facts[0]!],proof,period))
    .toThrow("Duplicate canonical");
 });
 it("does not rewrite historical Site attribution or count events outside period",()=>{
  const changed={...facts[0]!,registeredAt:"2026-10-31T23:59:59Z"};
  const r=rollupAuthorizedParticipation([changed],proof,period);
  expect(r.totals.registrations).toBe(0);
 });
});
