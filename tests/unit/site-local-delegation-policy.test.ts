import { describe, expect, it } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import {
  assertLocalDelegateGrant, assertLocalDelegationIssuer,
  delegationExpiration, localResponsibilityRoles,
} from "@/domain/site-local-delegation-policy";

const resource = { organizationId: "church-a", siteId: "site-a", programId: "program-a" };
function registrar(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    actorPersonId: "person-a", accountId: "account-a",
    sessionId: "session-a", grantId: "grant-a", grantSiteId: "site-a",
    role: "registrar", capabilities: new Set(["admin.manage"]),
    scope: { organizationIds: ["church-a"], siteIds: ["site-a"], programIds: ["program-a"] },
    ...overrides,
  };
}

describe("GF-B local Site responsibility boundaries", () => {
  it("permits only a verified host registrar for the exact church Program/Site", () => {
    expect(() => assertLocalDelegationIssuer(registrar(), resource)).not.toThrow();
    for (const actor of [
      registrar({ role: "site_leader" }),
      registrar({ role: "teacher" }),
      registrar({ capabilities: new Set(["program.launch.start"]) }),
      registrar({ demoFacilitator: { accountId: "fake", personId: "person-a", sourceAccountId: "fake" } }),
      registrar({ grantSiteId: "site-b" }),
      registrar({ scope: { organizationIds: ["church-b"], siteIds: ["site-a"], programIds: ["program-a"] } }),
      registrar({ scope: { organizationIds: ["church-a"], siteIds: ["site-b"], programIds: ["program-a"] } }),
      registrar({ scope: { organizationIds: ["church-a"], siteIds: ["site-a"], programIds: ["program-b"] } }),
    ]) expect(() => assertLocalDelegationIssuer(actor, resource)).toThrow();
  });
  it("requires verified, active exact-Site named staff with the correct role", () => {
    const correct = { role: "site_leader", active: true, verified: true,
      samePerson: true, organizationMatches: true, siteMatches: true };
    expect(() => assertLocalDelegateGrant(correct, "site_director")).not.toThrow();
    for (const key of ["active", "verified", "samePerson", "organizationMatches", "siteMatches"] as const) {
      expect(() => assertLocalDelegateGrant({ ...correct, [key]: false }, "site_director")).toThrow();
    }
    expect(() => assertLocalDelegateGrant(correct, "room_facilitator")).toThrow();
    expect(() => assertLocalDelegateGrant({ ...correct, role: "room_facilitator" }, "room_facilitator")).not.toThrow();
    expect(localResponsibilityRoles).toEqual({ site_director: "site_leader", room_facilitator: "room_facilitator" });
  });
  it("rejects expired or overly long appointments", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    expect(delegationExpiration("2026-11-01T12:00:00.000Z", now).toISOString())
      .toBe("2026-11-01T12:00:00.000Z");
    for (const end of ["bogus", "2026-10-23T12:00:00.000Z",
      "2026-10-22T12:00:00.000Z", "2027-02-01T12:00:00.000Z"]) {
      expect(() => delegationExpiration(end, now)).toThrow();
    }
  });
});
