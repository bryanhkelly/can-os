import { describe, expect, it } from "vitest";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { assertCapability } from "@/domain/command-context";
import { getWorkspaceHome, getWorkspaceLinks } from "@/components/shell/workspace-navigation.registry";

const personId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const principal = { accountId, sessionId: "44444444-4444-4444-8444-444444444444", activeGrantId: grantId };
const grant = { id: grantId, accountId, personId, role: "app_admin", organizationId: null, siteId: null, active: true };

describe("platform App Admin role isolation", () => {
  it("accepts only a current explicitly selected active account-wide grant", () => {
    const context = resolveAccessContext(principal, [grant]);
    expect(context.role).toBe("app_admin");
    expect(context.actorPersonId).toBe(personId);
    expect(context.scope.organizationIds).toEqual([]);
    expect(context.scope.siteIds).toEqual([]);
    expect(() => assertCapability(context, "platform.admin")).not.toThrow();
  });

  it("does not convert platform membership into Site or canonical authority", () => {
    const context = resolveAccessContext(principal, [grant]);
    expect(roleCapabilities.app_admin).toEqual(["platform.admin"]);
    for (const denied of ["admin.manage", "blueprint.read", "blueprint.configure",
      "blueprint.review", "credential.issue", "site.identity.review",
      "enrollment:manage", "student:read"]) {
      expect(() => assertCapability(context, denied)).toThrow();
    }
  });

  it("rejects a platform grant scoped to an institution or site", () => {
    expect(() => resolveAccessContext(principal, [{...grant, organizationId: "school-org"}])).toThrow();
    expect(() => resolveAccessContext(principal, [{...grant, siteId: "school-site"}])).toThrow();
    expect(() => resolveAccessContext(principal, [{...grant, active: false}])).toThrow();
  });

  it("uses a dedicated platform workspace without school navigation", () => {
    expect(getWorkspaceHome("app_admin")).toBe("/platform");
    const paths = getWorkspaceLinks("app_admin")?.map(item => item.path) ?? [];
    expect(paths).toContain("/platform");
    expect(paths).not.toContain("/admin");
    expect(paths).not.toContain("/canonical/blueprints");
    expect(paths).not.toContain("/staff/students");
  });
});
