import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { siteDate, summarizeExpectedOnsiteAttendance } from "@/domain/expected-attendance";
import { loadExpectedAttendanceCoverage } from "@/modules/attendance/expected-attendance-queries";

const state=vi.hoisted(()=>({rows:{} as Record<string,unknown[]>,filters:new Map<string,SQL>()}));
vi.mock("@/db/client",()=>({db:{select:()=>({
  table:"",
  from(table:Table){this.table=getTableName(table);return this;},
  where(filter:SQL){state.filters.set(this.table,filter);return this;},
  then(resolve:(rows:unknown[])=>unknown,reject:(reason:unknown)=>unknown){
    return Promise.resolve(state.rows[this.table]??[]).then(resolve,reject);
  },
})}}));
const program={id:"program",organizationId:"organization",siteId:"site",deliveryModel:{onsite:true}};
beforeEach(()=>{state.rows={};state.filters.clear();});

describe("attendance calendar-day utilities",()=>{
  it("uses the same site date key across UTC midnight and DST",()=>{
    expect(siteDate(new Date("2027-01-15T01:00Z"),"America/Los_Angeles")).toBe("2027-01-14");
    expect(siteDate(new Date("2026-11-02T07:30Z"),"America/Los_Angeles")).toBe("2026-11-01");
  });
  it("counts completed local calendar days through a fall-back transition",()=>{
    const result=summarizeExpectedOnsiteAttendance({
      program,timeZone:"America/Los_Angeles",asOf:new Date("2026-11-02T08:30:00Z"),windowDays:2,
      years:[{id:"year",siteId:"site",organizationId:"organization",programId:"program",status:"active",startsOn:"2026-01-01",endsOn:"2026-12-31"}],
      calendars:[{id:"calendar",schoolYearId:"year",siteId:"site",active:true,version:1}],
      calendarDays:["2026-10-31","2026-11-01"].map(calendarDate=>({
        academicCalendarId:"calendar",calendarDate,type:"instructional",instructionalMinutes:60,
      })),
      schedules:[{id:"schedule",schoolYearId:"year",siteId:"site",programId:"program",active:true,
        effectiveFrom:"2026-01-01",effectiveThrough:null}],
      periods:[0,6].map(dayOfWeek=>({scheduleTemplateId:"schedule",dayOfWeek,type:"instruction"})),
      enrollments:[{studentProfileId:"student",programId:"program",schoolYearId:"year",startedAt:null,endedAt:null}],
      effectiveFacts:[],
    });
    expect(result).toMatchObject({windowStart:"2026-10-31",windowThrough:"2026-11-01",expectedDays:2,unmarkedExpectedDays:2});
  });
  it("queries enough dates for sites ahead of and behind UTC, including a new school year",async()=>{
    state.rows.sites=[{id:"ahead",timezone:"Pacific/Kiritimati"},{id:"behind",timezone:"America/Los_Angeles"}];
    await loadExpectedAttendanceCoverage([
      {...program,id:"east",siteId:"ahead"},{...program,id:"west",siteId:"behind"},
    ],[],new Date("2027-01-01T11:00:00Z"),30);
    const filter=state.filters.get("school_years");
    if(!filter)throw new Error("Missing school-year query");
    const params=new PgDialect().sqlToQuery(filter).params;
    expect(params).toContain("2027-01-02");
    expect(params).toContain("2026-11-28");
  });
  it("preserves an explicitly requested date rather than replacing it with today",async()=>{
    state.rows.sites=[{id:"site",timezone:"America/Los_Angeles"}];
    await loadExpectedAttendanceCoverage([program],[],new Date("2027-01-01T01:00Z"),1,
      {date:"2026-12-15",studentIds:new Map()});
    const filter=state.filters.get("school_years");
    if(!filter)throw new Error("Missing school-year query");
    const params=new PgDialect().sqlToQuery(filter).params;
    expect(params.filter(value=>value==="2026-12-15")).toHaveLength(2);
  });
});
