import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("independent onsite custody resolution panel", () => {
  it("retains a two-person proposal and approval rather than direct single-click release", () => {
    const text=readFileSync("src/components/operations/OnsitePickupPanel.tsx","utf8");
    const start=text.indexOf("{student.activeHolds.map(hold =>");
    const end=text.indexOf("{!student.release &&",start);
    const panel=text.slice(start,end);
    expect(panel).toContain("proposePickupCustodyResolution");
    expect(panel).toContain("roster.canProposeHoldResolution && !hold.pendingResolution");
    expect(panel).toContain("sectionId: student.sectionId ?? undefined");
    expect(panel).toContain("resolvePickupCustodyHold");
    expect(panel).toContain("hold.pendingResolution.proposerPersonId !== roster.reviewerPersonId");
    expect(panel).toContain("proposalId: hold.pendingResolution!.id");
    expect(panel).not.toContain("} resolvePickupCustodyHold");
    expect(panel).toContain('className="mt-4 rounded-lg border border-danger/40');
  });
});
