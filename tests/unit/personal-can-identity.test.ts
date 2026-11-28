import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { personalCanSignupSchema, isAccountOnlyGrant, eligiblePersonalLanding } from "@/domain/personal-account-signup";
import { myCanContactInput, accountProfileCanEdit } from "@/domain/can-account-profile";

describe("Personal CAN account boundaries", () => {
  it("requires name and normalized email, not an institutional role", () => {
    expect(personalCanSignupSchema.parse({firstName:" Ann ",lastName:" Lee ",email:"ANN@EXAMPLE.COM",adultConfirmed:true})
      .email).toBe("ann@example.com");
    expect(personalCanSignupSchema.safeParse({firstName:"",lastName:"Lee",email:"user@example.com",adultConfirmed:true}).success).toBe(false);
    expect(personalCanSignupSchema.safeParse({firstName:"Min",lastName:"Lee",email:"child@example.com",adultConfirmed:false}).success).toBe(false);
  });
  it("a personal role never carries an organization or Site", () => {
    expect(isAccountOnlyGrant({role:"account_holder",organizationId:null,siteId:null})).toBe(true);
    expect(isAccountOnlyGrant({role:"account_holder",organizationId:"other",siteId:null})).toBe(false);
    expect(eligiblePersonalLanding("account_holder")).toBe("/account/");
    expect(eligiblePersonalLanding("site_admin")).toBeUndefined();
  });
  it("rejects ambiguous identities and shared demo account edits", () => {
    const current = { id:"grant",personId:"a" };
    expect(accountProfileCanEdit({demoAccountSwitching:false,actorPersonId:"a",
      activeGrantId:"grant",grants:[current]})).toBe(true);
    expect(accountProfileCanEdit({demoAccountSwitching:false,actorPersonId:"a",
      activeGrantId:"grant",grants:[current,{id:"other",personId:"b"}]})).toBe(false);
    expect(accountProfileCanEdit({demoAccountSwitching:true,actorPersonId:"a",
      activeGrantId:"grant",grants:[current]})).toBe(false);
  });
  it("reuses the immutable Person even when every old role is revoked", () => {
    const personal=readFileSync(
      "src/modules/identity/personal-account-signup.server.ts","utf8");
    const school=readFileSync(
      "src/modules/identity/school-setup-signup.server.ts","utf8");
    const signin=readFileSync(
      "src/modules/identity/passwordless-access.server.ts","utf8");
    expect(personal).toContain("eq(accountPersonGrants.active, true)");
    expect(personal).toContain("if (!existing.consumedAt)");
    expect(personal).toContain("if (demo) return provisionPrivatePersonalSignup(data,email)");
    expect(personal).toContain("if(!account)return genericResult");
    expect(personal).toContain("readDemoCredentialDomain(email,tx)");
    expect(personal).toContain('emailVerified: approval==="verified_email"');
    expect(personal).toContain("await requestOneTimeAccess(email, sender");
    expect(personal).toContain("let personId=account.personId");
    expect(personal).toContain("if(!existing?.active)throw new Error");
    expect(school).toContain("associated[0]?.personId??account.personId");
    expect(school).toContain("existingPersonId!==account.personId");
    expect(signin).toContain("boundAccount.personId!==chosenGrant?.personId");
  });

  it("accepts bounded personal contact fields only", () => {
    expect(myCanContactInput.parse({preferredName:"Avery",phone:"+1 (415) 555-0100"}).phone)
      .toBe("+1 (415) 555-0100");
    expect(myCanContactInput.safeParse({preferredName:"Sam",phone:"<script>"}).success).toBe(false);
    expect(myCanContactInput.safeParse({preferredName:"Sam",phone:"",isAdmin:true}).success).toBe(false);
  });
});
