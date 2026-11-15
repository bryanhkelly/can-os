import {describe,expect,it} from "vitest";
import {fourWeeklyClassroomWindows} from "@/domain/classroom-scheduling";

describe("four-week classroom schedule",()=>{
  it("creates four ordered dates exactly seven local calendar days apart",()=>{
    const rows=fourWeeklyClassroomWindows("2026-11-17T18:00","2026-11-17T19:00");
    expect(rows).toHaveLength(4);
    expect(rows.map(x=>new Date(x.startsAt).getTime())).toEqual(
      [...rows].map(x=>new Date(x.startsAt).getTime()).sort((a,b)=>a-b));
    expect(rows.every(x=>Date.parse(x.endsAt)-Date.parse(x.startsAt)===3600000)).toBe(true);
    expect(rows[3]!.startsAt).not.toBe(rows[0]!.startsAt);
  });
  it("rejects invalid start or end times",()=>{
    expect(()=>fourWeeklyClassroomWindows("not a date","2026-11-17T19:00")).toThrow();
    expect(()=>fourWeeklyClassroomWindows("2026-11-17T19:00","2026-11-17T18:00")).toThrow();
  });
});