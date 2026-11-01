import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Journey C includes independent custody hold resolution",()=>{
  it("requires distinct persisted onsite proposal and authorized site-leader approval",()=>{
    const source=readFileSync("tests/integration/journey-c-safe-school-day.integration.test.ts","utf8");
    const section=source.slice(source.indexOf("const hold = await pickup.createPickupCustodyHold"),
      source.indexOf("// An unknown adult is explicitly denied"));
    expect(section).toContain('role: "site_staff"');
    expect(section).toContain("pickup.proposePickupCustodyResolution({ data:");
    expect(section).toContain("pickup.resolvePickupCustodyHold({ data:");
    expect(section).toContain("proposalId: proposal.proposalId");
    expect(section).toContain("journey.setActor(school.siteLeader.actor)");
    expect(section).toContain('"verified_guardian_instructions"');
  });
});
