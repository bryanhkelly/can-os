import { describe, expect, it } from "vitest";
import {
  buildSiteClassMeetings, displaySiteClassTime, localClassTimeToInstant,
  siteWallWeek, validateSiteTimeZone,
} from "@/domain/class-session-local-time";
import { assertNativeClassSessionSeries } from "@/domain/native-class-sessions";

const tz="America/Los_Angeles";
describe("host Site wall-clock Class scheduling",()=>{
  it("retains 10 AM local time over spring DST even though UTC changes",()=>{
    const ids=Array.from({length:4},(_,i)=>"00000000-0000-4000-8000-00000000000"+i);
    const meetings=buildSiteClassMeetings(ids.map((requestId,index)=>({
      requestId,localStart:siteWallWeek("2027-03-07T10:00",index),
      durationMinutes:60,
    })),tz);
    expect(meetings[0]!.startsAt).toBe("2027-03-07T18:00:00.000Z");
    expect(meetings[1]!.startsAt).toBe("2027-03-14T17:00:00.000Z");
    expect(()=>assertNativeClassSessionSeries(meetings,"weekly")).not.toThrow();
    expect(displaySiteClassTime(meetings[1]!.startsAt,tz)).toContain("PDT");
  });
  it("rejects skipped and ambiguous DST wall times rather than silently shifting",()=>{
    expect(()=>localClassTimeToInstant("2027-03-14T02:30",tz)).toThrow(/daylight-saving/);
    expect(()=>localClassTimeToInstant("2027-11-07T01:30",tz)).toThrow(/daylight-saving/);
  });
  it("rejects invalid dates, time zones, lengths and overlapping sessions",()=>{
    expect(()=>validateSiteTimeZone("Not/A_Zone")).toThrow();
    expect(()=>localClassTimeToInstant("2027-02-30T10:00",tz)).toThrow(/real calendar/);
    expect(()=>buildSiteClassMeetings([{
      requestId:"test",localStart:"2027-04-01T10:00",durationMinutes:0,
    }],tz)).toThrow();
    const rows=buildSiteClassMeetings([
      {requestId:"a",localStart:"2027-04-01T10:00",durationMinutes:90},
      {requestId:"b",localStart:"2027-04-01T11:00",durationMinutes:45},
    ],tz);
    expect(()=>assertNativeClassSessionSeries(rows,"custom")).toThrow(/overlap/);
  });
  it("works for non-Pacific hosting Sites, independent of the browser's zone",()=>{
    const meeting=buildSiteClassMeetings([{
      requestId:"d",localStart:"2027-01-12T10:30",durationMinutes:30,
    }],"America/New_York");
    expect(meeting[0]!.startsAt).toBe("2027-01-12T15:30:00.000Z");
  });
});
