import {describe,it,expect} from "vitest";
import {canInviteConsentedFamily,familyInterestNextStep} from "../../src/modules/enrollment/family-interest-next-step";

const base={
  status:"new",consented:true,authorized:true,applicationId:null,
  familyStartRequestId:null,emailVerifiedAt:null,linkExpiresAt:null,
};
const flow={
  interestStatus:"new",consented:true,admissionsAuthorized:true,
  canInvite:true,hasFamilyStartRequest:false,emailVerified:false,
  hasApplication:false,latestOfferStatus:null,activeEnrollment:false,
  placedInClass:false,studentAccessStatus:null,
};

describe("canonical family interest eligibility",()=>{
  it("allows a consented, authorized new inquiry",()=>{
    expect(canInviteConsentedFamily(base)).toBe(true);
  });
  it("does not invite a closed interest, converted interest or submitted application",()=>{
    for(const status of ["closed","converted"]) {
      expect(canInviteConsentedFamily({...base,status})).toBe(false);
    }
    expect(canInviteConsentedFamily({...base,applicationId:"app"})).toBe(false);
  });
  it("only resends unverified expired links",()=>{
    const link={...base,familyStartRequestId:"request",linkExpiresAt:new Date("2026-10-31T00:00:00Z")};
    expect(canInviteConsentedFamily(link,new Date("2026-11-03T00:00:00Z"))).toBe(true);
    expect(canInviteConsentedFamily(link,new Date("2026-10-30T00:00:00Z"))).toBe(false);
    expect(canInviteConsentedFamily({...link,emailVerifiedAt:new Date("2026-11-01T00:00:00Z")},new Date("2026-11-03T00:00:00Z"))).toBe(false);
  });
});

describe("family next step",()=>{
  it("keeps closed unlinked interests terminal",()=>{
    expect(familyInterestNextStep({...flow,interestStatus:"closed"}).state).toBe("closed");
  });
  it("uses an actual linked application even if prior interest has been converted",()=>{
    expect(familyInterestNextStep({...flow,interestStatus:"converted",hasApplication:true,
      latestOfferStatus:"accepted"}).state).toBe("activate_enrollment");
  });
  it("does not claim class placement from enrollment alone",()=>{
    expect(familyInterestNextStep({...flow,hasApplication:true,
      activeEnrollment:true,placedInClass:false}).state).toBe("assign_class");
  });
  it("does not turn a failed authority lookup into institutional refusal",()=>{
    expect(familyInterestNextStep({...flow,admissionsAuthorized:false,
      authorizationUnavailable:true,canInvite:false}).state).toBe("authorization_unavailable");
  });
  it("keeps student access distinct from class placement and attendance",()=>{
    expect(familyInterestNextStep({...flow,hasApplication:true,activeEnrollment:true,
      placedInClass:true,studentAccessStatus:"access_unavailable"}).state).toBe("student_access");
    expect(familyInterestNextStep({...flow,hasApplication:true,activeEnrollment:true,
      placedInClass:true,studentAccessStatus:"approved"}).state).toBe("first_day_preparation");
  });
});
