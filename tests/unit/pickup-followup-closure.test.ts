import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("verified pickup closes every outstanding same-day follow-up", () => {
  it("settles assigned, waiting and new uncollected-child Actions within the release transaction",()=>{
    const code=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
    const release=code.slice(code.indexOf("export const recordVerifiedPickupRelease"),
      code.indexOf("export const recordDeniedPickup"));
    const select=release.slice(release.indexOf("const openFollowUps ="),
      release.indexOf("if (openFollowUps.length)"));
    expect(select).toContain('inArray(actions.status, ["open", "in_progress", "waiting"])');
    expect(select).toContain("eq(actions.siteId, school.siteId)");
    expect(select).toContain("eq(actions.subjectId, data.studentProfileId)");
    expect(select).toContain("eq(actions.programId, data.programId)");
    const resolving=release.slice(release.indexOf("if (openFollowUps.length)"));
    expect(resolving).toContain('status: "resolved"');
    expect(resolving).toContain("Verified pickup release recorded:");
    expect(resolving).toContain("eventType: EventTypes.ActionResolved");
    expect(resolving).toContain('aggregateType: "action", aggregateId: followUp.id');
  });
});
