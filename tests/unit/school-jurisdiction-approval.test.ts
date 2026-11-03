import {describe,expect,it} from "vitest";
import {
  hasCurrentIndependentJurisdictionReview,isSiteLocationChangePending,
  openingApprovalPredatesLocationChange,
} from "@/domain/school-jurisdiction-approval";

const stamp={scopeFingerprint:"jurisdiction-scope-v1:abcdef01",profileVersionId:"policy-v3"};
const action={status:"resolved",metadata:{
  reviewState:"independently_verified",...stamp,
  requesterPersonId:"church-editor",reviewedByPersonId:"can-reviewer",
  reviewedAt:"2026-11-03T18:00:00Z",
  reviewNote:"The physical school Site and current policy evidence were independently evaluated.",
  reviewedSourceUrls:["https://state.example.gov/official"],
}};
const now=new Date("2026-11-03T19:00:00Z");

describe("independent school jurisdiction approval",()=>{
  it("requires an exact reviewer, scope, source and version stamp",()=>{
    expect(hasCurrentIndependentJurisdictionReview(action,stamp,now)).toBe(true);
    expect(isSiteLocationChangePending(action,stamp,now)).toBe(false);
    expect(hasCurrentIndependentJurisdictionReview(action,{...stamp,profileVersionId:"policy-v4"},now))
      .toBe(false);
    expect(hasCurrentIndependentJurisdictionReview(action,{...stamp,scopeFingerprint:"new-location"},now))
      .toBe(false);
  });
  it("does not accept a generic resolved Action as legal verification",()=>{
    for(const change of [
      {status:"open"},
      {metadata:{...action.metadata,reviewState:"needs_independent_review"}},
      {metadata:{...action.metadata,reviewedByPersonId:"church-editor"}},
      {metadata:{...action.metadata,reviewedSourceUrls:[]}},
      {metadata:{...action.metadata,reviewNote:"Reviewed"}},
      {metadata:{...action.metadata,reviewedAt:"2026-11-04T00:00:00Z"}},
    ]){
      expect(hasCurrentIndependentJurisdictionReview({...action,...change},stamp,now))
        .toBe(false);
    }
    expect(isSiteLocationChangePending({
      status:"resolved",metadata:{reviewState:"needs_independent_review"},
    },stamp,now)).toBe(true);
  });
  it("rejects opening evidence issued before an address change",()=>{
    expect(openingApprovalPredatesLocationChange(
      "2026-11-01T00:00:00Z","2026-11-02T00:00:00Z")).toBe(true);
    expect(openingApprovalPredatesLocationChange(
      "2026-11-03T00:00:00Z","2026-11-02T00:00:00Z")).toBe(false);
    expect(openingApprovalPredatesLocationChange(
      null,"2026-11-02T00:00:00Z")).toBe(true);
  });
});
