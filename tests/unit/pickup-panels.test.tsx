import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuardianPickupPanel } from "@/components/operations/GuardianPickupPanel";
import { OnsitePickupPanel } from "@/components/operations/OnsitePickupPanel";

vi.mock("@/modules/operations/pickup.functions", () => ({
  createPickupAuthorization: vi.fn(),
  createPickupCustodyHold: vi.fn(),
  getGuardianPickupWorkspace: vi.fn(),
  getOnsitePickupRoster: vi.fn(),
  recordDeniedPickup: vi.fn(),
  recordUncollectedChild: vi.fn(),
  recordVerifiedPickupRelease: vi.fn(),
  resolvePickupCustodyHold: vi.fn(),
  revokePickupAuthorization: vi.fn(),
}));

describe("role-appropriate pickup panels", () => {
  it("makes staff witness and non-release boundaries explicit", () => {
    const html = renderToStaticMarkup(<OnsitePickupPanel date="2026-10-28" />);
    expect(html).toContain("Verified pickup &amp; custody release");
    expect(html).toContain("personally witness the handoff");
    expect(html).toContain("A denied attempt is not a release");
    expect(html).not.toContain("Authorize a pickup person");
  });

  it("keeps legal identity data minimal and family authority distinct from staff release", () => {
    const html = renderToStaticMarkup(<GuardianPickupPanel />);
    expect(html).toContain("Pickup authorization &amp; release history");
    expect(html).toContain("School staff must still verify the adult");
    expect(html).toContain('id="pickup"');
    expect(html).not.toContain("Record verified release");
  });
});
