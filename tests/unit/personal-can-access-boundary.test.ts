import { describe, expect, it } from "vitest";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { accessLandingPath, safeAccessReturnTo } from "@/domain/access-navigation";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";

describe("Account-only identity has no school privilege", () => {
  const accountId = "account";
  const personId = "person";
  const grant = {
    id: "grant", accountId, personId, role: "account_holder",
    organizationId: null, siteId: null, active: true,
  };
  it("has a personal landing and zero institutional capabilities", () => {
    expect(accessLandingPath("account_holder")).toBe("/account/");
    expect(getWorkspaceHome("account_holder")).toBe("/account/");
    expect(roleCapabilities.account_holder).toEqual([]);
    const access = resolveAccessContext({
      accountId, sessionId: "session", activeGrantId: grant.id,
    }, [grant]);
    expect([...access.capabilities]).toEqual([]);
    expect(access.scope.organizationIds).toEqual([]);
    expect(access.scope.siteIds).toEqual([]);
    expect(access.actorPersonId).toBe(personId);
  });
  it("preserves only internal return URLs", () => {
    expect(safeAccessReturnTo("/account/")).toBe("/account/");
    expect(safeAccessReturnTo("/launch/family?programId=hello")).toBe("/launch/family?programId=hello");
    expect(safeAccessReturnTo("//attacker.example/path")).toBeUndefined();
    expect(safeAccessReturnTo("/access/verify")).toBeUndefined();
  });
});
