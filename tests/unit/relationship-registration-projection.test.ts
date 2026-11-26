import {describe,it,expect} from "vitest";
import {roleCapabilities} from "@/domain/access-context";
import {platformOwnerMayActAs} from "@/domain/platform-owner-delegation";
import {relationshipProposalMetrics} from "@/domain/relationship-metric-policy";
import {projectRelationshipRegistrationMetric,type RelationshipRegistrationFact} from "@/domain/relationship-registration-projection";
import type {ReportingRelationship,VerifiedRelationshipActor} from "@/domain/bottom-up-reporting-relationships";

const id=(n:number)=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const owner=id(1),ownerB=id(2),recipient=id(3),site=id(4),siteB=id(5),offering=id(6),person=id(7),proposer=id(8),decider=id(9);
const metric={metricKey:"class.registrations",definitionVersion:"0.1.0"};
const reach={metricKey:"class.uniquePeople",definitionVersion:"0.1.0"};
const agreement:ReportingRelationship={
  id:id(10),ownerOrganizationId:owner,recipientOrganizationId:recipient,scopeKind:"organization",scopeId:owner,
  relationshipKind:"affiliation",metrics:[metric,reach],validThrough:null,proposedByPersonId:proposer,
  proposedAt:"2026-11-20T00:00:00Z",status:"accepted",acceptedByPersonId:decider,acceptedAt:"2026-11-21T00:00:00Z",
};
const sameOffering={...agreement,id:id(11),scopeKind:"offering" as const,scopeId:offering};
const agreementB={...agreement,id:id(12),ownerOrganizationId:ownerB,scopeId:ownerB};
const actor:VerifiedRelationshipActor={actorPersonId:decider,grantSiteId:null,scope:{organizationIds:[recipient]},capabilities:new Set(["relationships.report"])};
const first:RelationshipRegistrationFact={source:"native_class_enrollment",sourceId:id(20),personId:person,
  courseVersionId:id(21),programId:null,deliverySiteId:site,operatingOrganizationId:owner,creditedOrganizationId:null,
  registeredAt:"2026-11-22T00:00:00Z",currentStatus:"active",offeringId:offering,classId:id(22)};
const second={...first,sourceId:id(23),deliverySiteId:siteB,operatingOrganizationId:ownerB,classId:id(24)};
const now=new Date("2026-11-24T12:00:00Z");
const period={from:"2026-11-21T00:00:00Z",to:"2026-11-24T00:00:00Z",asOf:now.toISOString()};
const authority={recipientOrganizationId:recipient,currentAgreementIds:new Set([agreement.id,sameOffering.id,agreementB.id]),
  sourceProof:{verifiedOrganizationIds:new Set([owner,ownerB]),verifiedSiteIds:new Set([site,siteB])},
  population:{classification:"real" as "real"|"synthetic"|"unknown"|"all",ownerDomains:new Map<string,string|null>([[owner,"owner.org"],[ownerB,"owner-b.org"]])}};
const project=(m=metric,grants:readonly ReportingRelationship[]=[agreement,sameOffering,agreementB],
  facts:readonly RelationshipRegistrationFact[]=[first,first,second],proof=authority)=>
    projectRelationshipRegistrationMetric(actor,recipient,m,grants,facts,proof,period,now);

describe("relationship registration projection",()=>{
  it("counts a fact once despite overlapping grants and duplicate join rows",()=>{
    expect(project()).toMatchObject({value:2,distinctContributors:1,
      agreementIds:[agreement.id,sameOffering.id,agreementB.id]});
    expect(project(reach)).toMatchObject({value:1,distinctContributors:1});
  });
  it("separates real, synthetic and unknown owners and their consent provenance",()=>{
    const ownerDomains=new Map<string,string|null>([[owner,"owner.org"],[ownerB,"training.school.demo"]]);
    expect(project(metric,undefined,undefined,{...authority,population:{ownerDomains,classification:"real"}})).toMatchObject({value:1,population:"real",agreementIds:[agreement.id,sameOffering.id]});
    expect(project(metric,undefined,undefined,{...authority,population:{ownerDomains,classification:"synthetic"}})).toMatchObject({value:1,population:"synthetic",agreementIds:[agreementB.id]});
    ownerDomains.set(ownerB,null);
    expect(project(metric,undefined,undefined,{...authority,population:{ownerDomains,classification:"unknown"}})).toMatchObject({value:1,population:"unknown",agreementIds:[agreementB.id]});
    ownerDomains.delete(ownerB);
    expect(()=>project(metric,undefined,undefined,{...authority,population:{ownerDomains,classification:"real"}})).toThrow("classification evidence missing");
  });
  it("never expands a shared Offering grant across independent operators",()=>{
    expect(project(metric,[sameOffering],[first,second])).toMatchObject({value:1,agreementIds:[sameOffering.id]});
  });
  it("requires current independent source authority and eligible agreements",()=>{
    expect(project(metric,[agreement],[first],{...authority,currentAgreementIds:new Set()})).toMatchObject({value:null,status:"no_authorized_evidence"});
    expect(()=>project(metric,[agreement],[first],{...authority,sourceProof:{...authority.sourceProof,verifiedSiteIds:new Set([siteB])}})).toThrow();
  });
  it("does not revive revoked or pre-acceptance facts",()=>{
    expect(project(metric,[{...agreement,status:"revoked"}],[first]).value).toBeNull();
    expect(project(metric,[agreement],[{...first,registeredAt:"2026-11-20T00:00:00Z"}]).value).toBeNull();
  });
  it("fails closed on contradictory canonical evidence or a changed metric version",()=>{
    expect(()=>project(metric,[agreement],[first,{...first,personId:id(25)}])).toThrow("Conflicting");
    expect(()=>project({...metric,definitionVersion:"9.0.0"})).toThrow();
  });
  it("does not infer noncredit registrations from native Class facts",()=>{
    const m={metricKey:"noncredit.registrations",definitionVersion:"1.0.0"};
    expect(project(m,[{...agreement,metrics:[m]}],[first]).value).toBeNull();
  });
});
describe("relationship consent policy",()=>{
  it("does not grant relationship authority to ordinary administrators or delegated owner roles",()=>{
    expect(roleCapabilities.reporting_relationship_manager).toEqual(["relationships.propose","relationships.decide","relationships.revoke","relationships.report"]);
    for(const role of ["app_admin","platform_owner","network_admin","site_admin","registrar","account_holder"])
      expect(roleCapabilities[role]?.some(c=>c.startsWith("relationships."))).toBe(false);
    expect(platformOwnerMayActAs("reporting_relationship_manager")).toBe(false);
  });
  it("exposes only explicitly version-pinned terms and no invented Class completion metric",()=>{
    expect(relationshipProposalMetrics("class").map(m=>m.metricKey).sort()).toEqual(["class.registrations","class.uniquePeople"]);
    expect(relationshipProposalMetrics("offering").some(m=>m.metricKey==="class.formalCompletions")).toBe(false);
    expect(relationshipProposalMetrics("organization").every(m=>m.metricKey.startsWith("class.")||m.metricKey.startsWith("noncredit."))).toBe(true);
  });
});
