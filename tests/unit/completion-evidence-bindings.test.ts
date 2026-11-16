import { describe, expect, it } from "vitest";
import {
  matchesApprovedEvidenceBinding, type EvidenceBinding,
} from "@/domain/completion-evidence-bindings";

const now=new Date("2026-11-16T20:00:00.000Z");
const claim={
  evidenceVersionId:"evidence-V1",participantPersonId:"learner-A",
  organizationId:"operator-A",deliverySiteId:"site-A",
  actorPersonId:"registrar-A",reason:"Documented correction reason",
};
const correction={
  purpose:"completion_correction" as const,
  registrationId:"registration-A",expectedDecisionId:"decision-123",
  approvedCorrectionOutcome:"voided" as const,
};
const approved:EvidenceBinding={
  purpose:"completion_correction",evidenceVersionId:"evidence-V1",
  noncreditRegistrationId:"registration-A",expectedDecisionId:"decision-123",
  approvedCorrectionOutcome:"voided",awardIssuanceId:null,
  participantPersonId:"learner-A",providerOrganizationId:"operator-A",
  deliverySiteId:"site-A",submittedByPersonId:"registrar-A",
  approvedByPersonId:"independent-reviewer",
  approvedAt:new Date("2026-11-15T20:00:00Z"),
  reviewReason:"Documented correction reason",
};
const matches=(binding:EvidenceBinding,claimOverride=claim)=>
  matchesApprovedEvidenceBinding(binding,correction,claimOverride,now);

describe("WS3 independently reviewed source evidence binding",()=>{
  it("approves one specific reviewer-backed completion correction",()=>{
    expect(matches(approved)).toBe(true);
  });
  it("denies another learner, organization or delivery Site",()=>{
    expect(matches(approved,{...claim,participantPersonId:"learner-B"})).toBe(false);
    expect(matches(approved,{...claim,organizationId:"operator-B"})).toBe(false);
    expect(matches(approved,{...claim,deliverySiteId:"site-B"})).toBe(false);
  });
  it("denies different decisions, outcomes, registrations and evidence documents",()=>{
    expect(matches({...approved,expectedDecisionId:"unrelated-decision"})).toBe(false);
    expect(matches({...approved,approvedCorrectionOutcome:"not_yet_completed"})).toBe(false);
    expect(matches({...approved,noncreditRegistrationId:"other-registration"})).toBe(false);
    expect(matches(approved,{...claim,evidenceVersionId:"unrelated-document"})).toBe(false);
  });
  it("requires submitted reason to match the independent approval exactly",()=>{
    expect(matches(approved,{...claim,reason:"A new unreviewed reason"})).toBe(false);
  });
  it("rejects self approval, learner approval and another submitter",()=>{
    expect(matches({...approved,approvedByPersonId:"registrar-A"})).toBe(false);
    expect(matches({...approved,approvedByPersonId:"learner-A"})).toBe(false);
    expect(matches({...approved,submittedByPersonId:"another-registrar"})).toBe(false);
    expect(matches(approved,{...claim,actorPersonId:"learner-A"})).toBe(false);
  });
  it("rejects future-dated, missing and invalid approval time",()=>{
    expect(matches({...approved,approvedAt:new Date("2026-11-17T00:00:00Z")})).toBe(false);
    expect(matches({...approved,approvedAt:new Date("invalid")})).toBe(false);
    expect(matchesApprovedEvidenceBinding(null,correction,claim,now)).toBe(false);
  });
  it("authorizes an award revocation only for the exact issued award",()=>{
    const awardTarget={purpose:"award_revocation" as const,issuanceId:"issuance-ONE"};
    const awardLink:EvidenceBinding={
      ...approved,purpose:"award_revocation",
      noncreditRegistrationId:null,expectedDecisionId:null,
      approvedCorrectionOutcome:null,awardIssuanceId:"issuance-ONE",
    };
    expect(matchesApprovedEvidenceBinding(awardLink,awardTarget,claim,now)).toBe(true);
    expect(matchesApprovedEvidenceBinding(awardLink,{
      purpose:"award_revocation",issuanceId:"issuance-TWO",
    },claim,now)).toBe(false);
    expect(matchesApprovedEvidenceBinding({...awardLink,expectedDecisionId:"decision-123"},
      awardTarget,claim,now)).toBe(false);
    expect(matchesApprovedEvidenceBinding(approved,awardTarget,claim,now)).toBe(false);
  });
});
