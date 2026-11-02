import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import { assertOnsitePickupScope } from "@/domain/onsite-pickup-access";

const base: VerifiedAccessGrant = {
  id: "grant", accountId: "account", personId: "staff", role: "site_staff",
  organizationId: "org", siteId: "site-a", active: true,
};
const session = { accountId: "account", sessionId: "session", activeGrantId: "grant" };

describe("onsite pickup capability and resource scope", () => {
  it.each(["room_facilitator", "site_staff", "site_leader"] as const)(
    "%s requires an additive pickup capability and original Site scope", role => {
      const actor = resolveAccessContext(session, [{ ...base, role }]);
      actor.scope.programIds = ["program"];
      expect(actor.capabilities.has("onsite.pickup.release")).toBe(true);
      expect(() => assertOnsitePickupScope(actor, "site-a")).not.toThrow();
      expect(() => assertOnsitePickupScope(actor, "site-b")).toThrow("site-bound");
    });

  it("denies guardians, teachers, organization-wide grants and empty program scope", () => {
    for (const role of ["guardian", "teacher", "paraeducator"]) {
      const actor = resolveAccessContext(session, [{ ...base, role }]);
      actor.scope.programIds = ["program"];
      expect(() => assertOnsitePickupScope(actor)).toThrow();
    }
    const actor = resolveAccessContext(session, [base]);
    expect(() => assertOnsitePickupScope({ ...actor, grantSiteId: null })).toThrow();
    expect(() => assertOnsitePickupScope(actor)).toThrow();
  });
});
