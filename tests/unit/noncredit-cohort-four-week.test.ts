import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chooseFourWeekCohortPlans, isFourWeeklyCohort } from "@/domain/noncredit-cohort-schedule";

const meeting = (id: string, start: string, linked = false) => ({
  planId: id, linked, state: "scheduled", startsAt: start,
  endsAt: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
});
const weekly = [
  meeting("a","2026-11-20T18:00:00Z"),
  meeting("b","2026-11-27T18:00:00Z"),
  meeting("c","2026-12-04T18:00:00Z"),
  meeting("d","2026-12-11T18:00:00Z"),
];
describe("COGIC-style four-session cohort scheduling", () => {
  it("selects four authorized-looking, unallocated weekly dates, not arbitrary first four", () => {
    expect(chooseFourWeekCohortPlans([
      meeting("other","2026-11-21T18:00:00Z"),...weekly,
    ],Date.parse("2026-11-01"))).toEqual(["a","b","c","d"]);
  });
  it("never calls two or three sessions four weeks", () => {
    expect(chooseFourWeekCohortPlans(weekly.slice(0,3),0)).toEqual([]);
    expect(isFourWeeklyCohort(weekly.slice(0,3))).toBe(false);
  });
  it("rejects a linked, cancelled, duplicate or off-week meeting", () => {
    expect(chooseFourWeekCohortPlans(weekly.map((r,i)=>i===2?{...r,linked:true}:r),0)).toEqual([]);
    expect(chooseFourWeekCohortPlans(weekly.map((r,i)=>i===2?{...r,state:"cancelled"}:r),0)).toEqual([]);
    expect(isFourWeeklyCohort([weekly[0]!,weekly[1]!,weekly[1]!,weekly[3]!])).toBe(false);
    expect(isFourWeeklyCohort([weekly[0]!,meeting("bad","2026-11-29T18:00:00Z"),weekly[2]!,weekly[3]!])).toBe(false);
  });
  it("accepts a local-time schedule across a one-hour daylight saving shift", () => {
    expect(isFourWeeklyCohort([
      meeting("a","2027-03-05T18:00:00Z"),
      meeting("b","2027-03-12T18:00:00Z"),
      meeting("c","2027-03-19T17:00:00Z"),
      meeting("d","2027-03-26T17:00:00Z"),
    ])).toBe(true);
  });
});

describe("four-week operator journey integration", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");
  it("links facilitator calendar from authorized host courses, not the media rehearsal catalog", () => {
    const host = read("src/routes/canonical.lab.facilitated.tsx");
    expect(host).toContain("<ClassroomSchedulePanel choices={data.choices}");
    expect(host).not.toContain("<ClassroomSchedulePanel choices={rehearsalOptions?.choices??[]}");
    const calendar = read("src/components/learning/ClassroomSchedulePanel.tsx");
    expect(calendar).toContain('import { Input } from "@/components/ui/input"');
    expect(calendar).toContain('import { Select } from "@/components/ui/select"');
  });
  it("requires four dated meetings and locks the underlying calendar before assignment", () => {
    const server = read("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
    expect(server).toContain("planIds:z.array(id).length(4)");
    expect(server).toContain("!isFourWeeklyCohort(slots)");
    expect(server).toContain('.for("update")');
    expect(server).toContain("await assignCohortPlan(tx,scope,planId)");
    const operator = read("src/components/enrollment/NoncreditReleaseOperations.tsx");
    expect(operator).toContain("chooseFourWeekCohortPlans");
    expect(operator).toContain("fourWeekPlanIds.length===4");
  });
});
