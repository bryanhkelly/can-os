import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
const command=source.slice(source.indexOf("export const recordUncollectedChild"));
const roster=source.slice(source.indexOf("export const getOnsitePickupRoster"),
  source.indexOf("export const recordVerifiedPickupRelease"));
const review=readFileSync("src/modules/operations/onsite-day-review.functions.ts","utf8");

describe("one canonical uncollected-child follow-up per school day",()=>{
  it("uses the same release lock before checking for a different request ID",()=>{
    const lock=command.indexOf('"pickup-release:"');
    const replay=command.indexOf("if (replay) {");
    const lookup=command.indexOf("const [existingUncollected]");
    const newAction=command.indexOf("await tx.insert(actions).values({");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(replay);
    expect(lookup).toBeGreaterThan(lock);
    expect(newAction).toBeGreaterThan(lookup);
    expect(command).toContain('eq(actions.subjectId, data.studentProfileId)');
    expect(command).toContain('eq(actions.siteId, school.siteId)');
    expect(command).toContain('eq(actions.programId, data.programId)');
    expect(command).toContain("already exists for this student and school day");
  });
  it("does not forget a staff follow-up when it moves to in-progress or waiting",()=>{
    expect(roster).toContain('inArray(actions.status, ["open", "in_progress", "waiting"])');
    expect(review).toContain('["open","in_progress","waiting"].includes(row.status)');
  });
});
