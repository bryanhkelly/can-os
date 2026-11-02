import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const code = readFileSync("src/modules/operations/pickup.functions.ts", "utf8");
const uncollected = code.slice(code.indexOf("export const recordUncollectedChild"));
const holds = code.slice(code.indexOf("export const createPickupCustodyHold"),
  code.indexOf("export const resolvePickupCustodyHold"));

describe("uncollected-child safety and immutable reporting witness", () => {
  it("records the original witness independently of reassigned follow-up ownership", () => {
    expect(uncollected).toContain("reportedByPersonId: actor.actorPersonId");
    expect(uncollected).toContain("(replay.metadata.reportedByPersonId ?? replay.ownerPersonId) !== actor.actorPersonId");
    expect(uncollected).toContain("ownerPersonId: followUpOwnerPersonId");
    // No new event on a retry with the same identity.
    expect(uncollected.indexOf("if (replay) {"))
      .toBeLessThan(uncollected.indexOf("await tx.insert(actions).values({"));
  });
  it("serializes hold creation and uncollected-family notifications under the same safety lock", () => {
    const lock = '"pickup-safety:" + data.studentProfileId + ":" + data.programId';
    const holdLock = holds.indexOf(lock);
    const uncollectedLock = uncollected.indexOf(lock);
    expect(holdLock).toBeGreaterThan(0);
    expect(uncollectedLock).toBeGreaterThan(0);
    expect(uncollectedLock).toBeLessThan(uncollected.indexOf('"pickup-release:"'));
    expect(uncollectedLock).toBeLessThan(uncollected.indexOf('eq(pickupCustodyHolds.status, "active")'));
    expect(uncollectedLock).toBeLessThan(uncollected.indexOf('maySendAutomatedPickupFamilyNotice({'));
  });
});
