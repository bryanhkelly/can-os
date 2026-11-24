import {describe,it,expect} from "vitest";
import {assessNetworkReportingReadiness,assertNetworkReportingReadinessReader} from "@/domain/network-reporting-readiness";
import type {AccessContext} from "@/domain/access-context";
const counts={configuredUnits:0,activeUnits:0,configuredMemberships:0,currentMemberships:0,configuredGrants:0,currentGrants:0,currentGrantHosts:0};
const actor:AccessContext={accountId:"account",sessionId:"session",grantId:"grant",actorPersonId:"person",
  role:"network_admin",grantSiteId:null,capabilities:new Set(["network.sites.read"]),scope:{organizationIds:["network"]}};
const org={id:"network",type:"denomination"};
describe("HQ network reporting setup readiness",()=>{
  it("reports missing setup without treating it as zero learning outcomes",()=>{
    const result=assessNetworkReportingReadiness(counts);
    expect(result.executionAvailable).toBe(false);
    expect(result.blockers).toHaveLength(4);
  });
  it("does not authorize execution even with populated setup",()=>{
    expect(assessNetworkReportingReadiness({configuredUnits:1,activeUnits:1,configuredMemberships:1,currentMemberships:1,configuredGrants:2,currentGrants:2,currentGrantHosts:1}).executionAvailable).toBe(false);
    expect(()=>assessNetworkReportingReadiness({...counts,currentGrants:1})).toThrow("reconcile");
  });
  it("requires direct exact HQ authority",()=>{
    expect(()=>assertNetworkReportingReadinessReader(actor,org)).not.toThrow();
    for(const bad of [{...actor,role:"site_admin"},{...actor,grantSiteId:"site"},
      {...actor,scope:{organizationIds:["network","other"]}},{...actor,sessionAccountId:"owner"},
      {...actor,delegatedByPlatformOwner:true as const},{...actor,capabilities:new Set<string>()}]){
      expect(()=>assertNetworkReportingReadinessReader(bad,org)).toThrow();
    }
    expect(()=>assertNetworkReportingReadinessReader(actor,{...org,id:"other"})).toThrow();
  });
});
