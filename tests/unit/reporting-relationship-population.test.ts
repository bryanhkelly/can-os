import {describe,it,expect} from "vitest";
import {relationshipIdentityEligible,canConnectRelationshipPopulations} from "@/domain/reporting-relationship-population";
describe("relationship population isolation",()=>{
  it("permits same-population tags without permitting synthetic-to-real relationships",()=>{
    expect(canConnectRelationshipPopulations("church.demo","denomination.demo")).toBe(true);
    expect(canConnectRelationshipPopulations("church.org","partner.org")).toBe(true);
    expect(canConnectRelationshipPopulations("church.demo","partner.org")).toBe(false);
    expect(canConnectRelationshipPopulations("church.org","partner.demo")).toBe(false);
    expect(canConnectRelationshipPopulations(null,"partner.org")).toBe(false);
    expect(canConnectRelationshipPopulations(null,null)).toBe(false);
  });
  it("requires verified real mailboxes for real organizations",()=>{
    const real={organizationDomain:"church.org",email:"manager@church.org",mailboxVerified:true,authenticationMethod:"email_link" as const};
    expect(relationshipIdentityEligible(real)).toBe(true);
    expect(relationshipIdentityEligible({...real,mailboxVerified:false})).toBe(false);
    expect(relationshipIdentityEligible({...real,email:"manager@church.demo"})).toBe(false);
    expect(relationshipIdentityEligible({...real,email:"manager@example.com"})).toBe(false);
    expect(relationshipIdentityEligible({...real,authenticationMethod:"private_access_code"})).toBe(false);
  });
  it("allows ordinary independently assigned demo identities only within synthetic reporting",()=>{
    const demo={organizationDomain:"church.demo",email:"manager@church.demo",mailboxVerified:false,authenticationMethod:"private_access_code" as const};
    expect(relationshipIdentityEligible(demo)).toBe(true);
    expect(relationshipIdentityEligible({...demo,authenticationMethod:"local_demo_code"})).toBe(true);
    expect(relationshipIdentityEligible({...demo,organizationDomain:"church.org"})).toBe(false);
    expect(relationshipIdentityEligible({...demo,email:"manager@church.org"})).toBe(false);
  });
});
