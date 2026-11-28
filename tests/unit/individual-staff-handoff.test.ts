import { describe, expect, it } from "vitest";
import { individualStaffIssuerEligible, individualStaffTargetEligible, requiresIndividualStaffCredential } from "@/domain/individual-staff-handoff";
import { localStaffInviteInput } from "@/domain/staff-onboarding-policy";

const verifiedIssuer={personId:"operator",disabled:false,email:"registrar@school.org",
  emailVerifiedAt:new Date(),privateCredential:false,authenticationMethod:"email_link"};
const privateIssuer={...verifiedIssuer,email:"registrar@school.demo",emailVerifiedAt:null,
  privateCredential:true,authenticationMethod:"private_access_code"};
const existing={personId:"person",disabled:false,privateCredential:true};

describe("individual staff handoff",()=>{
  it("accepts a verified-email or private-code direct operator",()=>{
    expect(individualStaffIssuerEligible(verifiedIssuer,"operator")).toBe(true);
    expect(individualStaffIssuerEligible(privateIssuer,"operator")).toBe(true);
  });
  it("rejects public credentials and mismatched or disabled operators",()=>{
    for(const issuer of [
      {...privateIssuer,authenticationMethod:"local_demo_code"},
      {...privateIssuer,authenticationMethod:null},
      {...privateIssuer,email:"registrar@school.org"},
      {...privateIssuer,disabled:true},
      {...verifiedIssuer,personId:"other"},
      {...verifiedIssuer,emailVerifiedAt:null},
      {...verifiedIssuer,email:"registrar@school.demo"},
    ]) expect(individualStaffIssuerEligible(issuer,"operator")).toBe(false);
  });
  it("never adopts existing Accounts based on email alone",()=>{
    expect(individualStaffTargetEligible(undefined,undefined)).toBe(true);
    expect(individualStaffTargetEligible(undefined,"person")).toBe(false);
    expect(individualStaffTargetEligible(existing,"person")).toBe(true);
    expect(individualStaffTargetEligible(existing,undefined)).toBe(false);
    expect(individualStaffTargetEligible(existing,"other")).toBe(false);
    expect(individualStaffTargetEligible({...existing,privateCredential:false},"person")).toBe(false);
    expect(individualStaffTargetEligible({...existing,disabled:true},"person")).toBe(false);
    expect(individualStaffTargetEligible({...existing,personId:null},undefined)).toBe(false);
  });
  it("defaults registered synthetic staff to shared code even with optional confirmation",()=>{
    const approved={demoIdentity:true,approvedSharedScope:true,existingPrivateCredential:false,confirmationProvided:true};
    expect(requiresIndividualStaffCredential(approved)).toBe(false);
    expect(requiresIndividualStaffCredential({...approved,confirmationProvided:false})).toBe(false);
    expect(requiresIndividualStaffCredential({...approved,existingPrivateCredential:true})).toBe(true);
    expect(requiresIndividualStaffCredential({...approved,approvedSharedScope:false})).toBe(true);
    expect(requiresIndividualStaffCredential({...approved,approvedSharedScope:false,confirmationProvided:false})).toBe(false);
    expect(requiresIndividualStaffCredential({...approved,demoIdentity:false,approvedSharedScope:false})).toBe(false);
  });
  it("requires explicit bounded evidence when requesting individual handoff",()=>{
    const data={email:"teacher@school.demo",firstName:"Teacher",lastName:"Example",
      role:"teacher",siteId:"11111111-1111-4111-8111-111111111111"};
    expect(localStaffInviteInput.safeParse(data).success).toBe(true);
    expect(localStaffInviteInput.safeParse({...data,privateIdentityConfirmation:{reason:"confirmed in person"}}).success).toBe(true);
    expect(localStaffInviteInput.safeParse({...data,privateIdentityConfirmation:{reason:"yes"}}).success).toBe(false);
    expect(localStaffInviteInput.safeParse({...data,privateIdentityConfirmation:{reason:"confirmed in person",existingPersonId:"not-a-uuid"}}).success).toBe(false);
  });
});
