import { describe, expect, it } from "vitest";
import { planExtendedSessions } from "@/domain/extended-learning-sessions";

const summer = { startsOn: "2027-06-07", endsOn: "2027-06-18" };
describe("Summer and after-school recurring sessions", () => {
  it("generates stable weekday meetings and excludes weekends", () => {
    const x=planExtendedSessions({
      fromDate: summer.startsOn, throughDate: summer.endsOn,
      weekdays: [1,2,3,4,5], startTime:"09:00", endTime:"15:00",
    }, summer, "America/Los_Angeles");
    expect(x).toHaveLength(10);
    expect(x[0].startsAt.toISOString()).toBe("2027-06-07T16:00:00.000Z");
    expect(x[0].instanceKey).toBe("extended:2027-06-07:09:00");
    expect(x.at(-1)?.date).toBe("2027-06-18");
  });
  it("resolves each occurrence using its date's daylight-saving offset", () => {
    const season={startsOn:"2027-03-12",endsOn:"2027-03-24"};
    const x=planExtendedSessions({
      fromDate:season.startsOn,throughDate:season.endsOn,weekdays:[5],
      startTime:"15:00",endTime:"17:00",
    },season,"America/New_York");
    expect(x.map(v=>v.startsAt.toISOString())).toEqual([
      "2027-03-12T20:00:00.000Z","2027-03-19T19:00:00.000Z",
    ]);
  });
  it("rejects reversed, out-of-season, invalid, and zero-match patterns",()=>{
    const input={fromDate:"2027-06-07",throughDate:"2027-06-18",
      weekdays:[1],startTime:"09:00",endTime:"15:00"};
    expect(()=>planExtendedSessions({...input,fromDate:"2027-06-01"},summer,"UTC")).toThrow(/inside/);
    expect(()=>planExtendedSessions({...input,throughDate:"2027-06-06"},summer,"UTC")).toThrow(/inside/);
    expect(()=>planExtendedSessions({...input,weekdays:[1,1]},summer,"UTC")).toThrow(/unique/);
    expect(()=>planExtendedSessions({...input,endTime:"08:00"},summer,"UTC")).toThrow(/same-day/);
    expect(()=>planExtendedSessions({...input,fromDate:"2027-06-13",throughDate:"2027-06-13"},summer,"UTC")).toThrow(/No sessions/);
    expect(()=>planExtendedSessions({...input,fromDate:"2027-02-30"},summer,"UTC")).toThrow(/real calendar/);
  });
  it("blocks nonexistent spring-forward and ambiguous fall-back local hours",()=>{
    const spring={startsOn:"2027-03-14",endsOn:"2027-03-14"};
    expect(()=>planExtendedSessions({fromDate:spring.startsOn,throughDate:spring.endsOn,
      weekdays:[0],startTime:"02:30",endTime:"03:30"},spring,"America/New_York")).toThrow(/does not exist/);
    const fall={startsOn:"2027-11-07",endsOn:"2027-11-07"};
    expect(()=>planExtendedSessions({fromDate:fall.startsOn,throughDate:fall.endsOn,
      weekdays:[0],startTime:"01:30",endTime:"02:30"},fall,"America/New_York")).toThrow(/Ambiguous/);
    expect(()=>planExtendedSessions({fromDate:fall.startsOn,throughDate:fall.endsOn,
      weekdays:[0],startTime:"00:30",endTime:"01:30"},fall,"America/New_York")).toThrow(/Ambiguous/);
  });
});
