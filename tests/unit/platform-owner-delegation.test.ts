import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { platformOwnerMayActAs, platformOwnerDelegationIsCurrent,
  ownerDelegationLifetimeMs } from "@/domain/platform-owner-delegation";
import { getWorkspaceHome, getWorkspaceLinks } from "@/components/shell/workspace-navigation.registry";

const source=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const accountId="11111111-1111-4111-8111-111111111111";
const personId="22222222-2222-4222-8222-222222222222";
const grantId="33333333-3333-4333-8333-333333333333";
const principal={accountId,sessionId:"44444444-4444-4444-8444-444444444444",activeGrantId:grantId};
const grant={id:grantId,accountId,personId,role:"platform_owner",organizationId:null,siteId:null,active:true};

describe("Platform Owner signed delegation foundation",()=>{
  it("resolves one explicit global owner grant without stealing a Site role",()=>{
    const ctx=resolveAccessContext(principal,[grant]);
    expect(ctx.role).toBe("platform_owner");
    expect(ctx.actorPersonId).toBe(personId);
    expect(ctx.capabilities.has("platform.owner")).toBe(true);
    expect(ctx.capabilities.has("platform.delegation.manage")).toBe(true);
    expect(ctx.capabilities.has("admin.manage")).toBe(false);
    expect(ctx.capabilities.has("instructional_track.review")).toBe(false);
    expect(()=>resolveAccessContext(principal,[{...grant,organizationId:"wrong-scope"}])).toThrow();
    expect(()=>resolveAccessContext(principal,[{...grant,siteId:"wrong-site"}])).toThrow();
    expect(()=>resolveAccessContext(principal,[{...grant,active:false}])).toThrow();
  });

  it("keeps the Platform Owner separate from Site navigation",()=>{
    expect(getWorkspaceHome("platform_owner")).toBe("/platform");
    const links=getWorkspaceLinks("platform_owner")?.map(item=>item.path)??[];
    expect(links).toContain("/platform");
    expect(links).not.toContain("/admin");
    expect(roleCapabilities.app_admin).not.toContain("platform.owner");
  });

  it("uses a bounded delegation lifetime and refuses independent-review impersonation",()=>{
    expect(ownerDelegationLifetimeMs).toBe(900_000);
    expect(platformOwnerDelegationIsCurrent(null)).toBe(false);
    expect(platformOwnerDelegationIsCurrent(new Date("2026-11-23T00:00:00Z"),new Date("2026-11-23T00:01:00Z"))).toBe(false);
    expect(platformOwnerDelegationIsCurrent(new Date("2026-11-23T00:05:00Z"),new Date("2026-11-23T00:01:00Z"))).toBe(true);
    for(const role of ["platform_owner","app_admin","academic_content_reviewer",
      "can_network_steward","safeguarding_lead","can_credential_reviewer"]){
      expect(platformOwnerMayActAs(role),role).toBe(false);
    }
    for(const role of ["unknown_future_role","account_holder","student","guardian"]){
      expect(platformOwnerMayActAs(role),role).toBe(false);
    }
    expect(platformOwnerMayActAs("academic_content_creator")).toBe(true);
    expect(platformOwnerMayActAs("room_facilitator")).toBe(true);
    expect(platformOwnerMayActAs("site_admin")).toBe(true);
  });

  it("resolves delegated identity exclusively from original signed owner session and a live target grant",()=>{
    const auth=source("src/modules/identity/command-context.server.ts");
    const service=source("src/modules/identity/platform-owner-delegation.server.ts");
    const session=source("src/modules/identity/workspace-session.server.ts");
    expect(auth).toContain("getVerifiedPlatformOwnerSession(request)");
    expect(auth).toContain("session.delegatedGrantId");
    expect(auth).toContain("session.delegatedUntil<=now");
    expect(auth).toContain("expired owner delegation: return to Platform Owner");
    expect(auth).toContain("site.organizationId!==effectiveGrant.organizationId");
    expect(service).toContain("assertPlatformOwnerUndelegated(owner)");
    expect(auth).toContain('request.method!=="GET"');
    expect(auth).toContain("context.impersonatedByAccountId=session.accountId");
    expect(auth).toContain("platformOwnerMayActAs(exact.role)");
    expect(service).toContain('eq(accountPersonGrants.role, "platform_owner")');
    expect(service).toContain("eq(accessSessions.activeGrantId, owner.grantId)");
    expect(service).toContain('action: "platform.owner.delegation.started"');
    expect(service).toContain('action: "platform.owner.delegation.ended"');
    expect(service).toContain("await readOwnerDelegationGrants(target.accountId, target.personId, target.email, tx)");
    expect(session).toContain("context.delegatedByPlatformOwner");
    expect(session).toContain("ownerDelegation");
  });

  it("never lets an impersonated owner erase the persistent disclosure or select a new user role",()=>{
    const banner=source("src/components/shell/PlatformOwnerDelegationBanner.tsx");
    const nav=source("src/components/shell/WorkspaceTopBar.tsx");
    const switchRoute=source("src/routes/access.session.ts");
    expect(nav).toContain("<PlatformOwnerDelegationBanner");
    expect(banner).toContain("Return to Platform Owner");
    expect(banner).toContain("not a login by the selected user");
    expect(banner).not.toContain("onDismiss");
    expect(switchRoute).toContain("if(context.delegatedByPlatformOwner)");
  });

  it("cannot bootstrap silently or assign an owner from the browser",()=>{
    const script=source("scripts/provision-platform-owner.mjs");
    const migration=source("drizzle/0104_platform_owner_delegation.sql");
    expect(script).toContain('process.argv.includes("--execute")');
    expect(script).toContain("PLATFORM_OWNER_APPROVER_EMAIL");
    expect(script).toContain("PLATFORM_OWNER_TICKET");
    expect(script).toContain("BEGIN READ ONLY");
    expect(script).toContain("pg_advisory_xact_lock");
    expect(script).toContain("public.audit_events");
    expect(migration).toContain("account_person_grants_platform_owner_scope_ck");
    expect(migration).toContain("access_sessions_owner_delegation_ck");
    expect(migration).not.toContain("INSERT INTO");
  });

  it("creates a Release Center from real projected next steps, not a new approval ledger",()=>{
    const center=source("src/components/platform/PlatformReleaseCenter.tsx");
    const route=source("src/routes/platform.tsx");
    expect(center).toContain("projectPublisherReleaseNextStep");
    expect(center).toContain("requires authorized role");
    expect(center).not.toContain("UPDATE ");
    expect(route).toContain("<PlatformReleaseCenter");
    expect(route).toContain("summary.platformOwner && <PlatformOwnerDelegationPanel");
  });
});
