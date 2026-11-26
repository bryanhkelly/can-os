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
 it("uses the same metric implementation for each authorized owner population",()=>{
  const allFacts=[...facts,...facts.map(f=>({...f,sourceId:"real-"+f.sourceId,operatingOrganizationId:"orgB"})),
    {...facts[0]!,sourceId:"unknown",operatingOrganizationId:"orgC"}];
  const fullProof={...proof,verifiedOrganizationIds:new Set(["orgA","orgB","orgC"])};
  const ownerDomains=new Map<string,string|null>([["orgA","training.church.demo"],["orgB","church.org"],["orgC",null]]);
  const synthetic=rollupAuthorizedParticipation(allFacts,fullProof,period,{ownerDomains,classification:"synthetic"});
  const real=rollupAuthorizedParticipation(allFacts,fullProof,period,{ownerDomains,classification:"real"});
  expect(synthetic.totals).toEqual(real.totals);
  expect(rollupAuthorizedParticipation(allFacts,fullProof,period,{ownerDomains,classification:"unknown"}).totals.registrations).toBe(1);
  const combined=rollupAuthorizedParticipation(allFacts,fullProof,period,{ownerDomains,classification:"all"});
  expect(combined.totals.registrations).toBe(29);
  expect(combined.totals.uniquePeople).toBe(13);
  expect(()=>rollupAuthorizedParticipation(allFacts,proof,period,{ownerDomains,classification:"synthetic"})).toThrow("Out-of-scope");
 });
 it("does not confuse missing classification evidence with a known nullable domain",()=>{
  expect(()=>rollupAuthorizedParticipation(facts,proof,period,{ownerDomains:new Map(),classification:"all"})).toThrow("classification evidence missing");
  expect(rollupAuthorizedParticipation(facts,proof,period,{ownerDomains:new Map([["orgA",null]]),classification:"unknown"}).totals.registrations).toBe(14);
 });
 it("counts each registration status independently without adding distinct people across groups", () => {
  const statuses = ["registered", "active", "withdrawn", "completed", "cancelled"];
  const rows = statuses.map((currentStatus, index) => ({
   ...facts[0]!, sourceId: "status-" + index, currentStatus,
   personId: index < 2 ? "shared-person" : "person-" + index,
  }));
  const result = rollupAuthorizedParticipation(rows, proof, period);
  expect(result.totals).toEqual({ registrations: 5, uniquePeople: 4, active: 2, withdrawn: 1 });
  expect(result.sites[0]).toMatchObject(result.totals);
  expect(rollupAuthorizedParticipation([], proof, period).totals)
   .toEqual({ registrations: 0, uniquePeople: 0, active: 0, withdrawn: 0 });
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
