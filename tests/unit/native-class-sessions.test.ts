import { describe, expect, it } from "vitest";
import { assertNativeClassSessionSeries } from "@/domain/native-class-sessions";
import { facilitatedRoomOperationalState } from "@/domain/facilitated-learning";

function meetings(first="2027-02-03T10:00:00-08:00"){
  const starts=Array.from({length:4},(_,i)=>{
    const date=new Date(first);
    date.setUTCDate(date.getUTCDate()+i*7);
    return date;
  });
  return starts.map((start,i)=>({
    requestId:"00000000-0000-4000-8000-00000000000"+i,
    startsAt:start.toISOString(),
    endsAt:new Date(start.getTime()+60*60000).toISOString(),
  }));
}
describe("native Class Session scheduling",()=>{
  it("permits four consecutive weekly Sessions of equal duration",()=>{
    expect(()=>assertNativeClassSessionSeries(meetings(),"weekly")).not.toThrow();
  });
  it("permits the one-hour daylight-saving change of local session time",()=>{
    const list=meetings();
    list[1]!.startsAt=new Date(new Date(list[1]!.startsAt).getTime()-3600000).toISOString();
    list[1]!.endsAt=new Date(new Date(list[1]!.endsAt).getTime()-3600000).toISOString();
    expect(()=>assertNativeClassSessionSeries(list,"weekly")).not.toThrow();
  });
  it("rejects accidentally scheduling multiple Classes with one request identity",()=>{
    const list=meetings();
    list[2]!.requestId=list[1]!.requestId;
    expect(()=>assertNativeClassSessionSeries(list,"weekly")).toThrow();
  });
  it("rejects a non-weekly series advertised as the four-week pilot",()=>{
    const list=meetings();
    list[2]!.startsAt="2027-02-19T10:00:00-08:00";
    list[2]!.endsAt="2027-02-19T11:00:00-08:00";
    expect(()=>assertNativeClassSessionSeries(list,"weekly")).toThrow();
  });
  it("rejects differing meeting duration for the same weekly series",()=>{
    const list=meetings();
    list[3]!.endsAt=new Date(new Date(list[3]!.endsAt).getTime()+20*60000).toISOString();
    expect(()=>assertNativeClassSessionSeries(list,"weekly")).toThrow();
  });
  it("supports one-off and irregular school schedules without enforcing weekly cadence",()=>{
    expect(()=>assertNativeClassSessionSeries(meetings().slice(0,1),"custom")).not.toThrow();
    const list=meetings().slice(0,2);
    list[1]!.startsAt="2027-02-04T10:00:00-08:00";
    list[1]!.endsAt="2027-02-04T11:00:00-08:00";
    expect(()=>assertNativeClassSessionSeries(list,"custom")).not.toThrow();
  });
  it("rejects invalid time windows and excessive booking size",()=>{
    const list=meetings();
    list[0]!.endsAt=list[0]!.startsAt;
    expect(()=>assertNativeClassSessionSeries(list,"weekly")).toThrow();
    expect(()=>assertNativeClassSessionSeries([],"custom")).toThrow();
    expect(()=>assertNativeClassSessionSeries(Array.from({length:13},(_,i)=>({
      ...meetings()[0]!,requestId:"request-"+i,
    })),"custom")).toThrow();
  });
  it("rejects reusing a room that has ended, been revoked or exceeded eight hours",()=>{
    const now=new Date("2027-02-03T21:00:00.000Z");
    const room={
      state:"live" as const,
      startedAt:new Date(now.getTime()-60_000),
      endedAt:null as Date|null,
    };
    expect(facilitatedRoomOperationalState(room,now)).toBe("live");
    expect(facilitatedRoomOperationalState({...room,state:"ended" as const},now)).toBe("ended");
    expect(facilitatedRoomOperationalState({...room,endedAt:now},now)).toBe("ended");
    expect(facilitatedRoomOperationalState({
      ...room,startedAt:new Date(now.getTime()-8*60*60*1000),
    },now)).toBe("expired");
  });
});
