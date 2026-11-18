import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {selectedCohortSessionPlanIds} from "@/domain/noncredit-cohort-schedule";
import {fourSessionSchedulePreset,validClassroomSessionWindows} from "@/domain/classroom-scheduling";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
function meeting(id:string,start:string,linked=false){
  return {
    planId:id,linked,state:"scheduled",
    startsAt:start,endsAt:new Date(Date.parse(start)+60*60_000).toISOString(),
  };
}
const weekly=[
  meeting("a","2026-11-20T18:00:00Z"),
  meeting("b","2026-11-27T18:00:00Z"),
  meeting("c","2026-12-04T18:00:00Z"),
  meeting("d","2026-12-11T18:00:00Z"),
];

describe("flexible four-session COGIC pilot dates",()=>{
  it("accepts a weekly four-session plan",()=>{
    expect(validClassroomSessionWindows(weekly)).toBe(true);
  });
  it("accepts a 2x2 pattern with two meetings each week",()=>{
    expect(validClassroomSessionWindows([
      meeting("1","2026-11-17T18:00:00Z"),
      meeting("2","2026-11-19T18:00:00Z"),
      meeting("3","2026-11-24T18:00:00Z"),
      meeting("4","2026-11-26T18:00:00Z"),
    ])).toBe(true);
  });
  it("accepts a holiday pause that stretches four meetings to five weeks",()=>{
    const starts=[
      "2026-11-18T18:00:00Z","2026-11-25T18:00:00Z",
      "2026-12-09T18:00:00Z","2026-12-16T18:00:00Z",
    ];
    expect(validClassroomSessionWindows(starts.map((s,i)=>meeting(String(i),s)))).toBe(true);
  });
  it("rejects duplicate or overlapping meetings and invalid windows",()=>{
    expect(validClassroomSessionWindows([weekly[0]!,weekly[0]!])).toBe(false);
    expect(validClassroomSessionWindows([
      weekly[0]!,
      {...weekly[1]!,startsAt:weekly[0]!.startsAt},
    ])).toBe(false);
    expect(validClassroomSessionWindows([{
      startsAt:"2026-11-20T18:00:00Z",endsAt:"2026-11-20T17:00:00Z",
    }])).toBe(false);
    expect(validClassroomSessionWindows([])).toBe(false);
    expect(validClassroomSessionWindows([...weekly,weekly[0]!])).toBe(false);
  });
  it("requires deliberate selection, not the first four arbitrary meetings",()=>{
    const other=meeting("other","2026-11-21T18:00:00Z");
    expect(selectedCohortSessionPlanIds(
      [other,...weekly],["a","b","c","d"],Date.parse("2026-11-01"),
    )).toEqual(["a","b","c","d"]);
    expect(selectedCohortSessionPlanIds([other,...weekly],[],0)).toEqual([]);
    expect(selectedCohortSessionPlanIds(weekly,["a","a"],0)).toEqual([]);
    expect(selectedCohortSessionPlanIds(weekly,["missing"],0)).toEqual([]);
    expect(selectedCohortSessionPlanIds(weekly,["a","b","c","d","other"],0)).toEqual([]);
  });
  it("allows partial cohort assignment and rejects linked, stale or cancelled plans",()=>{
    expect(selectedCohortSessionPlanIds(weekly,["b","a"],0)).toEqual(["a","b"]);
    expect(selectedCohortSessionPlanIds(weekly,["a"],Date.parse("2026-12-01"))).toEqual([]);
    expect(selectedCohortSessionPlanIds([
      {...weekly[0]!,linked:true},...weekly.slice(1),
    ],["a"],0)).toEqual([]);
    expect(selectedCohortSessionPlanIds([
      {...weekly[0]!,state:"cancelled"},...weekly.slice(1),
    ],["a"],0)).toEqual([]);
  });
  it("supplies two convenient date patterns without making either mandatory",()=>{
    expect(fourSessionSchedulePreset(
      "2026-11-17T18:00","2026-11-17T19:00","weekly",
    )).toHaveLength(4);
    const twice=fourSessionSchedulePreset(
      "2026-11-17T18:00","2026-11-17T19:00","twice-weekly",
    );
    const days=twice.map(x=>Math.round((Date.parse(x.startsAt)-
      Date.parse(twice[0]!.startsAt))/(24*3600_000)));
    expect(days).toEqual([0,3,7,10]);
  });
});

describe("shared four-session operator and server boundaries",()=>{
  it("books four nonoverlapping sessions at one authorized Site and Course",()=>{
    const server=read("src/modules/learning/classroom-scheduling.functions.ts");
    expect(server).toContain("export const scheduleFourClassroomSessions");
    expect(server).toContain("meetings:z.array(scheduleInput).length(4)");
    expect(server).toContain("validClassroomSessionWindows(data.meetings)");
    expect(server).toContain("await scheduleOneClassroom(tx,host,meeting,now)");
    expect(server).not.toContain("four consecutive weekly meetings with the same duration");
  });
  it("attaches between one and four explicit sessions with transactional Site checks",()=>{
    const server=read("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
    expect(server).toContain("export const attachCohortSessionPlans");
    expect(server).toContain("planIds:z.array(id).min(1).max(4)");
    expect(server).toContain("!validClassroomSessionWindows(slots)");
    expect(server).toContain('.for("update")');
    expect(server).toContain("await assignCohortPlan(tx,scope,planId)");
    const scope=read("src/modules/enrollment/noncredit-cohort-operations.server.ts");
    expect(scope).toContain("plan.hostOrganizationId!==provider.organizationId");
    expect(scope).toContain("plan.courseVersionId!==release.courseVersionId");
    expect(scope).toContain("plan.siteId!==release.siteId");
  });
  it("shows editable local-time dates and deliberate selected meeting attachment in V6.1",()=>{
    const host=read("src/routes/canonical.lab.facilitated.tsx");
    const planner=read("src/components/learning/ClassroomSchedulePanel.tsx");
    const operator=read("src/components/enrollment/NoncreditReleaseOperations.tsx");
    expect(host).toContain("<ClassroomSchedulePanel choices={data.choices}");
    expect(planner).toContain('import { Input } from "@/components/ui/input"');
    expect(planner).toContain('import { Select } from "@/components/ui/select"');
    expect(planner).toContain('fillSessionDates("twice-weekly")');
    expect(planner).toContain('Save all four sessions');
    expect(operator).toContain("selectedCohortSessionPlanIds");
    expect(operator).toContain('import {Checkbox} from "@/components/ui/choice"');
    expect(operator).toContain("Attach selected sessions");
  });
});
