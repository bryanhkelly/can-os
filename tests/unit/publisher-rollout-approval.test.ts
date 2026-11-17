import { describe, expect, it } from "vitest";
import {
  assertIndependentPublisherDecision, assertMatchingCurrentRolloutAdoption,
  assertOperatorRolloutTransition, assertPublisherRolloutTransition,
  rolloutDecisionInputSchema, rolloutUpgradeRequired,
  type RolloutDecisionAuthority,
} from "@/domain/publisher-rollout-approval";

const id="00000000-0000-4000-8000-000000000001";
const next="00000000-0000-4000-8000-000000000002";
const other="00000000-0000-4000-8000-000000000003";
const authority:RolloutDecisionAuthority={
  reviewerPersonId:id,reviewerOrganizationId:id,publisherOrganizationId:id,
  authorPersonId:next,role:"publisher_reviewer",evidenceVersionId:other,
};
const local={
  planOfferingVersionId:id,adoptionOfferingVersionId:id,
  deployedOfferingVersionId:id,organizationId:id,authorizedOrganizationId:id,
  siteId:id,authorizedSiteIds:[id],operationGrantActive:true,
  adoptionApproved:true,siteGrantActive:true,planState:"approved" as const,
};
describe("WS5 independently governed publisher/operator rollout approvals",()=>{
  it("requires independently evidenced publisher decisions, never creator self approval",()=>{
    expect(()=>assertIndependentPublisherDecision(authority)).not.toThrow();
    for(const invalid of [
      {...authority,reviewerPersonId:next},
      {...authority,reviewerOrganizationId:other},
      {...authority,role:"local_operator" as const},
      {...authority,evidenceVersionId:null},
    ])expect(()=>assertIndependentPublisherDecision(invalid)).toThrow();
  });
  it("enforces monotonic publisher approval lifecycle",()=>{
    expect(()=>assertPublisherRolloutTransition("draft","submitted","publisher_author")).not.toThrow();
    expect(()=>assertPublisherRolloutTransition("submitted","approved","publisher_reviewer",authority)).not.toThrow();
    expect(()=>assertPublisherRolloutTransition("submitted","denied","publisher_reviewer",authority)).not.toThrow();
    for(const [from,to,role] of [
      ["draft","approved","publisher_author"],
      ["submitted","approved","publisher_author"],
      ["approved","submitted","publisher_author"],
      ["retired","approved","publisher_reviewer"],
    ] as const)expect(()=>assertPublisherRolloutTransition(from,to,role,authority)).toThrow();
  });
  it("keeps local operator preparation separate from independent publisher approval",()=>{
    expect(()=>assertOperatorRolloutTransition("draft","submitted","local_operator")).not.toThrow();
    expect(()=>assertOperatorRolloutTransition("submitted","approved","publisher_reviewer",authority)).not.toThrow();
    expect(()=>assertOperatorRolloutTransition("approved","activated","local_operator")).not.toThrow();
    for(const [from,to,actor] of [
      ["submitted","approved","local_operator"],
      ["approved","activated","publisher_reviewer"],
      ["denied","activated","local_operator"],
      ["withdrawn","submitted","local_operator"],
    ] as const)expect(()=>assertOperatorRolloutTransition(from,to,actor,authority)).toThrow();
  });
  it("requires exact immutable publisher/adopted/deployed versions and live local grants",()=>{
    expect(()=>assertMatchingCurrentRolloutAdoption(local)).not.toThrow();
    for(const invalid of [
      {...local,adoptionOfferingVersionId:next},
      {...local,deployedOfferingVersionId:next},
      {...local,authorizedOrganizationId:next},
      {...local,siteId:next},
      {...local,operationGrantActive:false},
      {...local,adoptionApproved:false},
      {...local,siteGrantActive:false},
      {...local,planState:"submitted" as const},
    ])expect(()=>assertMatchingCurrentRolloutAdoption(invalid)).toThrow();
  });
  it("rejects unevidenced decisions and never auto-upgrades local Classes",()=>{
    expect(rolloutDecisionInputSchema.safeParse({
      subjectId:id,expectedRevision:1,decision:"approved",
      evidenceVersionId:other,reason:"Independent publisher review complete",
    }).success).toBe(true);
    expect(rolloutDecisionInputSchema.safeParse({
      subjectId:id,expectedRevision:1,decision:"approved",reason:"approve",
    }).success).toBe(false);
    expect(rolloutUpgradeRequired(id,next)).toBe(true);
    expect(rolloutUpgradeRequired(id,id)).toBe(false);
  });
});
