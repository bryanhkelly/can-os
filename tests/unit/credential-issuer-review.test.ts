import { describe, expect, it } from "vitest";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { assertCANCredentialIssuerReviewer } from "@/domain/credential-issuer-review";
import { assertCANIdentityReviewer } from "@/domain/site-identity-review";

const accountId="11110000-0000-4000-8000-000000000001";
const personId="22220000-0000-4000-8000-000000000001";
const organizationId="33330000-0000-4000-8000-000000000001";
const siteId="44440000-0000-4000-8000-000000000001";
const principal={accountId,sessionId:"55550000-0000-4000-8000-000000000001",activeGrantId:"66660000-0000-4000-8000-000000000001"};

function actor(role:string,site:string|null=null){
  return resolveAccessContext(principal,[{
    id:principal.activeGrantId,accountId,personId,role,
    organizationId,siteId:site,active:true,
  }]);
}

describe("independent credential review uses the same CAN login",()=>{
  it("grants issuer review only to the dedicated organization reviewer",()=>{
    const reviewer=actor("can_credential_reviewer");
    expect(reviewer.capabilities.has("credential.issuer.review")).toBe(true);
    expect(reviewer.capabilities.has("site.identity.review")).toBe(false);
    expect(()=>assertCANCredentialIssuerReviewer(reviewer,{
      id:organizationId,type:"can_network",
    })).not.toThrow();
    expect(()=>assertCANIdentityReviewer(reviewer,{
      id:organizationId,type:"can_network",
    })).toThrow();
  });
  it("does not inherit credential review from network stewardship",()=>{
    const steward=actor("can_network_steward");
    expect(steward.capabilities.has("site.identity.review")).toBe(true);
    expect(steward.capabilities.has("credential.issuer.review")).toBe(false);
    expect(()=>assertCANCredentialIssuerReviewer(steward,{
      id:organizationId,type:"can_network",
    })).toThrow();
  });
  it("rejects cross-org, Site-scoped and demo delegate reviewers",()=>{
    const reviewer=actor("can_credential_reviewer");
    expect(()=>assertCANCredentialIssuerReviewer(reviewer,{
      id:"other-org",type:"can_network",
    })).toThrow();
    expect(()=>assertCANCredentialIssuerReviewer(reviewer,{
      id:organizationId,type:"school",
    })).toThrow();
    expect(()=>assertCANCredentialIssuerReviewer(
      {...reviewer,sessionAccountId:"other-account"},
      {id:organizationId,type:"can_network"},
    )).toThrow();
    expect(()=>assertCANCredentialIssuerReviewer(
      actor("can_credential_reviewer",siteId),
      {id:organizationId,type:"can_network"},
    )).toThrow();
  });
  it("preserves least privilege in the shared role map",()=>{
    const reviewer=new Set(roleCapabilities.can_credential_reviewer);
    for(const forbidden of [
      "credential.issue","site.identity.review","blueprint.review",
      "noncredit.enrollment.manage","enrollment:manage",
    ]) expect(reviewer.has(forbidden)).toBe(false);
    expect(reviewer.has("credential.issuer.review")).toBe(true);
  });
});
