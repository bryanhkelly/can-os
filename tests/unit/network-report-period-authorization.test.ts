import {describe,it,expect} from "vitest";
import {authorizeNetworkReportPeriod,type NetworkReportGrant} from "@/domain/network-reporting-authorization";
const now=new Date("2026-11-24T10:00:00Z");
const reader={networkOrganizationId:"network",actorPersonId:"reporter",currentNetworkReportCapability:true};
const grant:NetworkReportGrant={id:"g",networkOrganizationId:"network",hostOrganizationId:"host",
  allowedMetrics:["noncredit.registrations"],evidenceVersionId:"evidence",validFrom:"2026-10-01T00:00:00Z",validThrough:null,revokedAt:null};
const request={hostOrganizationIds:["host"],metricKeys:["noncredit.registrations"],from:"2026-11-01T00:00:00Z",to:"2026-11-20T00:00:00Z",unitId:"jurisdiction"};
const policy={networkOrganizationId:"network",actorPersonId:"reporter",allowedMetricKeys:["noncredit.registrations"],
  scopes:[{unitId:"jurisdiction" as string|null,hostOrganizationIds:["host"]}]};
describe("network reporting period scope",()=>{
  it("requires exact approved metric, unit, host and full period coverage",()=>{
    expect(authorizeNetworkReportPeriod(reader,[grant],request,policy,now).grantIds).toEqual(["g"]);
    for(const invalid of [{...request,unitId:null},{...request,unitId:"other"},{...request,metricKeys:["unapproved"]},{...request,hostOrganizationIds:["host","other"]}]){
      expect(()=>authorizeNetworkReportPeriod(reader,[grant],invalid,policy,now)).toThrow();
    }
    expect(()=>authorizeNetworkReportPeriod(reader,[{...grant,validFrom:"2026-11-05T00:00:00Z"}],request,policy,now)).toThrow();
  });
  it("rejects revoked, expired and future periods; old dates cannot revive grants",()=>{
    for(const invalid of [{...grant,revokedAt:"2026-11-23T00:00:00Z"},{...grant,validThrough:"2026-11-23T00:00:00Z"}]){
      expect(()=>authorizeNetworkReportPeriod(reader,[invalid],request,policy,now)).toThrow();
    }
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],{...request,to:"2026-12-01T00:00:00Z"},policy,now)).toThrow();
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],{...request,from:"2024-01-01T00:00:00Z"},policy,now)).toThrow();
  });
  it("rejects otherwise granted hosts outside the assigned unit and mismatched principals",()=>{
    const otherHost={...grant,id:"g2",hostOrganizationId:"other"};
    expect(()=>authorizeNetworkReportPeriod(reader,[grant,otherHost],{...request,hostOrganizationIds:["host","other"]},policy,now)).toThrow("unit and host scope");
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],request,{...policy,actorPersonId:"other"},now)).toThrow("match reader");
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],request,{...policy,networkOrganizationId:"other"},now)).toThrow("match reader");
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],request,{...policy,scopes:[...policy.scopes,...policy.scopes]},now)).toThrow("unit and host scope");
  });
  it("does not equate a jurisdiction assignment with national authority",()=>{
    expect(()=>authorizeNetworkReportPeriod(reader,[grant],{...request,unitId:null},policy,now)).toThrow();
    expect(authorizeNetworkReportPeriod(reader,[grant],{...request,unitId:null},{...policy,scopes:[{unitId:null,hostOrganizationIds:["host"]}]},now).unitId).toBeNull();
    expect(()=>authorizeNetworkReportPeriod({...reader,currentNetworkReportCapability:false},[grant],request,policy,now)).toThrow();
  });
});
