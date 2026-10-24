import {describe,expect,it} from "vitest";
import {inPhysicalCheckInWindow} from "@/domain/onsite-physical-presence-policy";

const siteDay={
  date:"2026-10-23",timezone:"America/Chicago",
  start:"09:00",end:"10:00",
};
describe("physical onsite presence window - never backdate or future attest",()=>{
  it("accepts a real adult report only during the local prearrival/current block window",()=>{
    expect(inPhysicalCheckInWindow({...siteDay,
      now:new Date("2026-10-23T13:00:00Z")})).toBe(true); // 08:00 CDT
    expect(inPhysicalCheckInWindow({...siteDay,
      now:new Date("2026-10-23T14:30:00Z")})).toBe(true); // 09:30 CDT
    expect(inPhysicalCheckInWindow({...siteDay,
      now:new Date("2026-10-23T12:59:00Z")})).toBe(false);
    expect(inPhysicalCheckInWindow({...siteDay,
      now:new Date("2026-10-23T15:00:00Z")})).toBe(false);
  });
  it("blocks other site-local dates and malformed/overnight schedules",()=>{
    expect(inPhysicalCheckInWindow({...siteDay,date:"2026-10-24",
      now:new Date("2026-10-23T14:30:00Z")})).toBe(false);
    expect(inPhysicalCheckInWindow({...siteDay,start:"20:00",end:"03:00",
      now:new Date("2026-10-23T14:30:00Z")})).toBe(false);
    expect(inPhysicalCheckInWindow({...siteDay,start:"25:00",
      now:new Date("2026-10-23T14:30:00Z")})).toBe(false);
  });
});
