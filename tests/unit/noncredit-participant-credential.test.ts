import { describe, expect, it } from "vitest";
import { assertNoncreditParticipantRelease } from "../../src/domain/noncredit-participant-credential";
import { AuthorizationError } from "../../src/domain/command-context";

describe("noncredit participant credential scope", () => {
  const demo = { demoScope: { organizationId: "org-a", siteId: "site-a" } };
  const release = { registeringOrganizationId: "org-a", siteId: "site-a" };
  it("permits ordinary credentials subject to existing release rules", () => {
    expect(() => assertNoncreditParticipantRelease({ demoScope: null }, release)).not.toThrow();
  });
  it("permits the approved demo credential for its exact release scope", () => {
    expect(() => assertNoncreditParticipantRelease(demo, release)).not.toThrow();
  });
  it.each([
    { registeringOrganizationId: "org-b", siteId: "site-a" },
    { registeringOrganizationId: "org-a", siteId: "site-b" },
    { registeringOrganizationId: "org-a", siteId: null },
  ])("rejects an unmatched organization or site: %j", other => {
    expect(() => assertNoncreditParticipantRelease(demo, other)).toThrow(AuthorizationError);
  });
});
