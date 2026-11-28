import {describe,it,expect} from "vitest";
import {
  assertRelationshipActor,matchingRelationshipIds,relationshipMatchesFact,
  transitionRelationship,validateRelationshipProposal,
  type ReportingRelationship,type VerifiedRelationshipActor,type VerifiedRelationshipScope,
} from "@/domain/bottom-up-reporting-relationships";
import type {SourceMetricContract} from "@/domain/reporting-metric-registry";
const id=(n:number)=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const owner=id(1),recipient=id(2),program=id(3),site=id(4),offer=id(5),other=id(6);
const proposer=id(7),decider=id(8);
const now=new Date("2026-11-24T12:00:00Z");
const metric={metricKey:"class.registrations",definitionVersion:"1.0.0"};
const registry:SourceMetricContract[]=[{...metric,sourceDomain:"native_class",sourceMetricKey:"registrations",
  label:"Registrations",source:"enrollment",denominator:"enrollments",rule:"distinct enrollment",
  timeBasis:"registration",disclosure:"private_operational"}];
const scope:VerifiedRelationshipScope={ownerOrganizationId:owner,scopeKind:"program",scopeId:program,siteId:site};
const pending:ReportingRelationship={id:id(10),ownerOrganizationId:owner,recipientOrganizationId:recipient,
  scopeKind:"program",scopeId:program,relationshipKind:"sponsorship",metrics:[metric],validThrough:null,
  proposedAt:"2026-11-20T12:00:00Z",proposedByPersonId:proposer,status:"pending",acceptedAt:null,acceptedByPersonId:null};
const accepted:ReportingRelationship={...pending,status:"accepted",acceptedAt:"2026-11-21T12:00:00Z",acceptedByPersonId:decider};
const actor=(org:string,person:string,cap:string,grantSiteId:string|null=null):VerifiedRelationshipActor=>({
  actorPersonId:person,scope:{organizationIds:[org]},capabilities:new Set([cap]),grantSiteId,
});
const reader=actor(recipient,decider,"relationships.report");
const fact={dimensions:{organizationId:owner,programId:program,siteId:site,offeringId:offer},
  occurredAt:"2026-11-22T12:00:00Z"};

describe("bottom-up reporting relationship consent",()=>{
  it("validates registry version, owner scope and independent allowlist",()=>{
    const proposal={recipientOrganizationId:recipient,scopeKind:"program",scopeId:program,
      relationshipKind:"sponsorship",metrics:[metric],validThrough:null};
    expect(validateRelationshipProposal(proposal,scope,registry,[metric],now)).toEqual(proposal);
    expect(()=>validateRelationshipProposal(proposal,scope,registry,[],now)).toThrow();
    expect(()=>validateRelationshipProposal({...proposal,metrics:[metric,metric]},scope,registry,[metric],now)).toThrow();
    expect(()=>validateRelationshipProposal({...proposal,recipientOrganizationId:owner},scope,registry,[metric],now)).toThrow();
    expect(()=>validateRelationshipProposal({...proposal,scopeId:other},scope,registry,[metric],now)).toThrow();
  });
  it("denies unscoped, site-wide escalation and delegated actors",()=>{
    expect(assertRelationshipActor(actor(owner,proposer,"relationships.propose",site),owner,"relationships.propose",site)).toBe(proposer);
    expect(()=>assertRelationshipActor(actor(owner,proposer,"relationships.propose",site),owner,"relationships.propose")).toThrow();
    expect(()=>assertRelationshipActor({...reader,scope:{}},recipient,"relationships.report")).toThrow();
    expect(()=>assertRelationshipActor({...reader,delegatedByPlatformOwner:true},recipient,"relationships.report")).toThrow();
    expect(()=>assertRelationshipActor({...reader,capabilities:new Set()},recipient,"relationships.report")).toThrow();
  });
  it("requires the recipient to accept with an independent Person",()=>{
    expect(transitionRelationship(pending,"accept",actor(recipient,decider,"relationships.decide"),now,scope).status).toBe("accepted");
    expect(()=>transitionRelationship(pending,"accept",actor(owner,proposer,"relationships.decide"),now,scope)).toThrow();
    expect(()=>transitionRelationship(pending,"accept",actor(recipient,proposer,"relationships.decide"),now,scope)).toThrow();
    expect(()=>transitionRelationship(accepted,"accept",actor(recipient,decider,"relationships.decide"),now,scope)).toThrow();
  });
  it("allows either party to revoke and prevents reviving a terminal agreement",()=>{
    const revoked=transitionRelationship(accepted,"revoke",actor(owner,proposer,"relationships.revoke",site),now,scope);
    expect(revoked.status).toBe("revoked");
    expect(transitionRelationship(accepted,"revoke",actor(recipient,decider,"relationships.revoke"),now,scope).status).toBe("revoked");
    expect(()=>transitionRelationship(revoked,"accept",actor(recipient,decider,"relationships.decide"),now,scope)).toThrow();
    expect(relationshipMatchesFact(revoked,recipient,metric,fact,now)).toBe(false);
  });
});

describe("bottom-up relationship fact-level eligibility",()=>{
  it("matches only the accepted exact scope and metric version",()=>{
    expect(relationshipMatchesFact(accepted,recipient,metric,fact,now)).toBe(true);
    expect(relationshipMatchesFact(pending,recipient,metric,fact,now)).toBe(false);
    expect(relationshipMatchesFact(accepted,other,metric,fact,now)).toBe(false);
    expect(relationshipMatchesFact(accepted,recipient,{...metric,definitionVersion:"2"},fact,now)).toBe(false);
    expect(relationshipMatchesFact(accepted,recipient,metric,{...fact,dimensions:{organizationId:owner}},now)).toBe(false);
    expect(relationshipMatchesFact(accepted,recipient,metric,{...fact,dimensions:{...fact.dimensions,programId:other}},now)).toBe(false);
  });
  it("cannot use an Offering to expose independent host facts",()=>{
    const offering={...accepted,scopeKind:"offering" as const,scopeId:offer};
    expect(relationshipMatchesFact(offering,recipient,metric,fact,now)).toBe(true);
    expect(relationshipMatchesFact(offering,recipient,metric,{...fact,dimensions:{...fact.dimensions,organizationId:other}},now)).toBe(false);
  });
  it("does not revive expired permissions through a historical report",()=>{
    expect(relationshipMatchesFact({...accepted,validThrough:"2026-11-23T12:00:00Z"},recipient,metric,fact,now)).toBe(false);
    expect(relationshipMatchesFact(accepted,recipient,metric,{...fact,occurredAt:"2026-11-20T12:00:00Z"},now)).toBe(false);
  });
  it("returns all direct provenance matches without duplicating the canonical fact",()=>{
    const orgWide={...accepted,id:id(11),scopeKind:"organization" as const,scopeId:owner};
    expect(matchingRelationshipIds(reader,recipient,[accepted,orgWide,accepted],metric,fact,now)).toEqual([accepted.id,orgWide.id]);
    expect(()=>matchingRelationshipIds(actor(other,decider,"relationships.report"),recipient,[accepted],metric,fact,now)).toThrow();
  });
});

describe("tagging without sharing and explicit reporting coverage",()=>{
  it("allows a relationship without permission to use any metric",()=>{
    const {recipientOrganizationId,scopeKind,scopeId,relationshipKind,validThrough}=pending;
    const tag=validateRelationshipProposal({recipientOrganizationId,scopeKind,scopeId,relationshipKind,validThrough,metrics:[]},scope,registry,[],now);
    expect(tag.metrics).toEqual([]);
    expect(relationshipMatchesFact({...accepted,metrics:[]},recipient,metric,fact,now)).toBe(false);
  });
  it("permits historical evidence only with explicit accepted coverage",()=>{
    const historical={...fact,occurredAt:"2026-11-19T12:00:00Z"};
    expect(relationshipMatchesFact(accepted,recipient,metric,historical,now)).toBe(false);
    expect(relationshipMatchesFact({...accepted,coverageMode:"all_history"},recipient,metric,historical,now)).toBe(true);
    expect(relationshipMatchesFact({...accepted,coverageMode:"from_date",coverageFrom:"2026-11-18T00:00:00Z"},recipient,metric,historical,now)).toBe(true);
    expect(relationshipMatchesFact({...accepted,coverageMode:"from_date",coverageFrom:"2026-11-20T00:00:00Z"},recipient,metric,historical,now)).toBe(false);
    expect(relationshipMatchesFact({...accepted,coverageMode:"from_date",coverageFrom:null},recipient,metric,historical,now)).toBe(false);
  });
  it("does not equate initiation with consent or grant sibling Site access",()=>{
    const initiator=actor(owner,proposer,"relationships.initiate",site);
    expect(assertRelationshipActor(initiator,owner,"relationships.initiate",site)).toBe(proposer);
    expect(()=>assertRelationshipActor(initiator,owner,"relationships.propose",site)).toThrow();
    expect(()=>assertRelationshipActor(initiator,owner,"relationships.initiate",other)).toThrow();
  });
});
