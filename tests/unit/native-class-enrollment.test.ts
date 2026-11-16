import { describe, expect, it } from "vitest";
import {
  verifiedAdultOn, assertNativeSelfEnrollmentEligible,
  authorizeNativeClassAttempt,
} from "@/domain/native-class-enrollment";

const now=new Date("2026-11-15T15:00:00Z");
const terms={
  visibility:"public" as const,
  enrollmentMethods:["self","assignment"] as Array<"self"|"invitation"|"assignment"|"approval">,
  opensAt:new Date("2026-11-01T00:00:00Z"),closesAt:new Date("2026-12-01T00:00:00Z"),
};
const policy={
  classState:"active" as const,offeringState:"published" as const,terms,
  adultVerified:true,adultAttested:true,consentAccepted:true,
  consentVersion:"consent-v1",consentText:"I agree to these approved class participation terms.",
};
const cls={
  id:"class",state:"active" as const,
  deploymentId:"deployment",adoptionId:"adoption",
  offeringVersionId:"offering",courseVersionId:"course",
};
const enrollment={
  id:"enrollment",classId:"class",learnerPersonId:"person",
  courseAttemptId:"attempt",status:"active" as const,
};
const attempt={
  id:"attempt",classEnrollmentId:"enrollment",enrollmentId:null,
  noncreditRegistrationId:null,deploymentId:"deployment",adoptionId:"adoption",
  offeringVersionId:"offering",courseVersionId:"course",status:"active" as const,
};
const authority={
  deploymentState:"active" as const,adoptionState:"approved" as const,
  adoptionValidFrom:new Date("2026-01-01T00:00:00Z"),adoptionValidThrough:null,
  coursePublished:true,offeringPublished:true,
};
const access={actorPersonId:"person",attempt,enrollment,classInstance:cls,authority,now};

describe("native Class learner policy",()=>{
  it("accepts adult DOB only with exact UTC age and real date",()=>{
    expect(verifiedAdultOn("2008-11-15",now)).toBe(true);
    expect(verifiedAdultOn("2008-11-16",now)).toBe(false);
    expect(verifiedAdultOn("2009-01-01",now)).toBe(false);
    expect(verifiedAdultOn("2000-02-30",now)).toBe(false);
    expect(verifiedAdultOn(null,now)).toBe(false);
    expect(verifiedAdultOn("invalid",now)).toBe(false);
  });
  it("separates public discovery from self enrollment method",()=>{
    expect(()=>assertNativeSelfEnrollmentEligible(policy,now)).not.toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,
      terms:{...terms,visibility:"private"}},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,
      terms:{...terms,visibility:"unlisted"}},now)).not.toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,
      terms:{...terms,enrollmentMethods:["assignment"]}},now)).toThrow();
  });
  it("rejects unpublished, expired, unconsented or unverified minor enrollment",()=>{
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,classState:"draft"},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,offeringState:"closed"},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,adultVerified:false},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,adultAttested:false},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,consentAccepted:false},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,consentVersion:null},now)).toThrow();
    expect(()=>assertNativeSelfEnrollmentEligible({...policy,
      terms:{...terms,closesAt:new Date("2026-10-01T00:00:00Z")}},now)).toThrow();
  });
  it("authorizes the exact native Class Enrollment and matching Course Attempt",()=>{
    expect(authorizeNativeClassAttempt(access)).toEqual({
      classId:"class",classEnrollmentId:"enrollment",
      courseAttemptId:"attempt",courseVersionId:"course",
    });
  });
  it("denies different Person, Course, Class, source or withdrawn participation",()=>{
    expect(()=>authorizeNativeClassAttempt({...access,actorPersonId:"other"})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,attempt:{...attempt,courseVersionId:"other"}})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,attempt:{...attempt,enrollmentId:"school"}})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,attempt:{...attempt,classEnrollmentId:null}})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,enrollment:{...enrollment,status:"withdrawn"}})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,authority:{...authority,adoptionState:"suspended"}})).toThrow();
    expect(()=>authorizeNativeClassAttempt({...access,authority:{...authority,adoptionValidThrough:new Date("2026-10-01")}})).toThrow();
  });
  it("permits completed read-only history only under explicit historical-read request",()=>{
    const completed={...access,attempt:{...attempt,status:"completed" as const},
      enrollment:{...enrollment,status:"completed" as const}};
    expect(()=>authorizeNativeClassAttempt(completed)).toThrow();
    expect(authorizeNativeClassAttempt({...completed,historicalRead:true}).courseAttemptId).toBe("attempt");
  });
});
