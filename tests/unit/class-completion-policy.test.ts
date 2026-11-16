import { describe, expect, it } from "vitest";
import {
  eligibleClassPoliciesAtEnrollment,resolveOriginalClassCompletionPolicy,
  type ClassCompletionPolicyCandidate,
} from "@/domain/class-completion-policy";

const date=(s:string)=>new Date(s);
const enrolled=date("2026-11-16T12:00:00.000Z");
const base:ClassCompletionPolicyCandidate={
  id:"policy-one",classId:"class-one",courseVersionId:"course-v1",
  versionNo:1,effectiveAt:date("2026-11-10T00:00:00Z"),
  publishedAt:date("2026-11-09T00:00:00Z"),
  authoredByPersonId:"author",approvedByPersonId:"reviewer",
  requiredVerifiedSessions:1,requireAllLessons:false,
  requirePassingAssessment:false,
};
const select=(policies:readonly ClassCompletionPolicyCandidate[])=>
  resolveOriginalClassCompletionPolicy({
    classId:"class-one",courseVersionId:"course-v1",enrolledAt:enrolled,policies,
  });

describe("WS3 immutable Class completion enrollment policy pin",()=>{
  it("selects the effective independently approved policy at original enrollment",()=>{
    expect(select([base])).toEqual({
      policyId:"policy-one",source:"original_enrollment",ambiguous:false,
    });
  });
  it("prefers latest effective published version and preserves deterministic tie break",()=>{
    expect(select([base,{...base,id:"policy-two",versionNo:2,
      effectiveAt:date("2026-11-12T00:00:00Z")}]).policyId).toBe("policy-two");
    expect(select([base,{...base,id:"policy-two",versionNo:2}]).policyId)
      .toBe("policy-two");
  });
  it("does not backdate a later publication to an existing learner",()=>{
    expect(select([{...base,publishedAt:date("2026-11-17T00:00:00Z")}]))
      .toMatchObject({policyId:null,ambiguous:false});
  });
  it("does not pin a policy whose effective date is after enrollment",()=>{
    expect(select([{...base,effectiveAt:date("2026-11-17T00:00:00Z")}]).policyId)
      .toBeNull();
  });
  it("does not allow same Course across a different Class, or another Course version",()=>{
    expect(select([{...base,classId:"another-class"}]).policyId).toBeNull();
    expect(select([{...base,courseVersionId:"course-v2"}]).policyId).toBeNull();
  });
  it("rejects self-approved, requirement-free, invalid, and unversioned policies",()=>{
    expect(select([{...base,approvedByPersonId:"author"}]).policyId).toBeNull();
    expect(select([{...base,requiredVerifiedSessions:0}]).policyId).toBeNull();
    expect(select([{...base,versionNo:0}]).policyId).toBeNull();
    expect(select([{...base,publishedAt:new Date("invalid")}]).policyId).toBeNull();
  });
  it("fails closed on duplicate policy identities or same-Class version conflicts",()=>{
    expect(select([base,base]).ambiguous).toBe(true);
    expect(select([base,{...base,id:"policy-duplicate-version"}]).ambiguous).toBe(true);
  });
  it("returns empty eligible set for invalid enrollment date",()=>{
    expect(eligibleClassPoliciesAtEnrollment({
      classId:"class-one",courseVersionId:"course-v1",
      enrolledAt:new Date("invalid"),policies:[base],
    })).toEqual([]);
  });
  it("does not depend on an Offering for a privately assigned Class",()=>{
    expect(select([base]).policyId).toBe("policy-one");
  });
});
