import {describe,expect,it} from "vitest";
import {matchesPublishedNoncreditRelease} from "@/domain/noncredit-self-enrollment";
const requested={deliveryMode:"independent",offeringVersionId:"offering",providerOrganizationId:"provider",
  closesAt:"2027-01-01T00:00:00Z",maxParticipants:25,consentVersion:"v1",consentText:"Reviewed exact consent text"};
const prior={...requested,closesAt:new Date(requested.closesAt),status:"published"};
describe("shared noncredit publication retry contract",()=>{
  it("accepts equivalent timestamps and identical terms",()=>{
    expect(matchesPublishedNoncreditRelease(prior,{...requested,closesAt:"2026-12-31T16:00:00-08:00"})).toBe(true);
  });
  it("denies closed releases and a different delivery mode",()=>{
    expect(matchesPublishedNoncreditRelease({...prior,status:"closed"},requested)).toBe(false);
    expect(matchesPublishedNoncreditRelease(prior,{...requested,deliveryMode:"facilitated"})).toBe(false);
  });
  it("denies changed consent, capacity, closing time, provider or Offering",()=>{
    for(const change of [{consentVersion:"v2"},{consentText:"changed"},{maxParticipants:26},
      {closesAt:"2027-01-02T00:00:00Z"},{providerOrganizationId:"other"},{offeringVersionId:"other"}]){
      expect(matchesPublishedNoncreditRelease(prior,{...requested,...change})).toBe(false);
    }
  });
});
