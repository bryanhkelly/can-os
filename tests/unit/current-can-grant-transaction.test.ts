import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { AccessContext } from "@/domain/access-context";
import {
  assertCurrentCANGrantForMutation,
} from "@/modules/identity/current-can-grant-transaction.server";

const token="A".repeat(43);
const scope={roles:["site_admin","registrar"],organizationId:"11111111-1111-4111-8111-111111111111",siteId:"22222222-2222-4222-8222-222222222222"};
const actor:AccessContext={
  accountId:"33333333-3333-4333-8333-333333333333",
  sessionId:"44444444-4444-4444-8444-444444444444",
  grantId:"55555555-5555-4555-8555-555555555555",
  actorPersonId:"66666666-6666-4666-8666-666666666666",
  grantSiteId:scope.siteId,
  role:"site_admin",capabilities:new Set(["admin.manage"]),
  scope:{organizationIds:[scope.organizationId],siteIds:[scope.siteId]},
};
function request(cookie=token){
  return new Request("https://can.example/class",{
    headers:{cookie:"__Host-can_os_session="+cookie},
  });
}
function tx(rows:unknown[]){
  const execute=vi.fn().mockResolvedValue({rows});
  return {execute};
}

afterEach(()=>vi.unstubAllEnvs());

describe("P0 single Person transactional CAN grant",()=>{
  it("requires exactly the current CAN bearer, Person, role, org and Site",async()=>{
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","P".repeat(40));
    const database=tx([{effective_account_id:actor.accountId}]);
    await expect(assertCurrentCANGrantForMutation(
      database as never,request(),actor,scope,
    )).resolves.toBeUndefined();
    expect(database.execute).toHaveBeenCalledTimes(1);
  });

  it("refuses authorization from expanded Site scope or demo delegation",async()=>{
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","P".repeat(40));
    for(const invalid of [
      {...actor, grantSiteId:null},
      {...actor, sessionAccountId:actor.accountId},
      {...actor, actorPersonId:null},
      {...actor, role:"guardian"},
      {...actor, scope:{organizationIds:[scope.organizationId],siteIds:["another-site"]}},
    ]){
      const database=tx([{effective_account_id:actor.accountId}]);
      await expect(assertCurrentCANGrantForMutation(
        database as never,request(),invalid,scope,
      )).rejects.toThrow();
      expect(database.execute).not.toHaveBeenCalled();
    }
  });

  it("fails closed for absent session, mismatched effective account or bad bearer",async()=>{
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","P".repeat(40));
    await expect(assertCurrentCANGrantForMutation(
      tx([]) as never,request(),actor,scope,
    )).rejects.toThrow();
    await expect(assertCurrentCANGrantForMutation(
      tx([{effective_account_id:"different-account"}]) as never,request(),actor,scope,
    )).rejects.toThrow();
    const database=tx([{effective_account_id:actor.accountId}]);
    await expect(assertCurrentCANGrantForMutation(
      database as never,request("bad"),actor,scope,
    )).rejects.toThrow();
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("rechecks privileged Demo Admin impersonation without changing target's grant",async()=>{
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER","P".repeat(40));
    const database=tx([{effective_account_id:actor.accountId}]);
    await expect(assertCurrentCANGrantForMutation(database as never,request(),{
      ...actor,impersonatedByAccountId:"f7100000-0000-4000-8000-000000000002",
    },scope)).resolves.toBeUndefined();
    const source=readFileSync("src/modules/identity/current-can-grant-transaction.server.ts","utf8");
    expect(source).toContain("admin_grant.active");
    expect(source).toContain("current_grant.account_id=session_owner.id");
    expect(source).toContain("current_grant.person_id=person.id");
  });

  it("does not introduce a canonical identity correspondence or accept privilege by email",()=>{
    const source=readFileSync("src/modules/identity/current-can-grant-transaction.server.ts","utf8");
    expect(source).toContain("target_account.person_id=");
    expect(source).toContain("current_grant.id=");
    expect(source).toContain("current_grant.organization_id");
    expect(source).toContain("current_grant.site_id");
    expect(source).toContain("FOR SHARE OF session,session_owner,target_account,current_grant,person");
    expect(source).not.toContain("access_account_canonical_principals");
    expect(source).not.toContain("canonical_accounts");
    expect(source).not.toContain("education_v30.");
  });
});
