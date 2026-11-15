import {describe,expect,it} from "vitest";
import {noncreditSeatsAvailable,noncreditRegistrationRoute} from "@/domain/noncredit-seat-policy";

describe("canonical noncredit capacity",()=>{
  it("does not release a withdrawn claim without an explicit release",()=>{
    expect(noncreditSeatsAvailable({capacity:2,claims:2,released:0,activeInvitations:0})).toBe(0);
  });
  it("returns one audited seat without erasing the original claim",()=>{
    expect(noncreditSeatsAvailable({capacity:2,claims:2,released:1,activeInvitations:0})).toBe(1);
  });
  it("reserves capacity for active waitlist invitations",()=>{
    expect(noncreditSeatsAvailable({capacity:2,claims:2,released:1,activeInvitations:1})).toBe(0);
  });
  it("never exposes negative availability",()=>{
    expect(noncreditSeatsAvailable({capacity:2,claims:2,released:0,activeInvitations:1})).toBe(0);
  });
  it("rejects unsourced or impossible reconciliation evidence",()=>{
    expect(()=>noncreditSeatsAvailable({capacity:2,claims:0,released:1,activeInvitations:0})).toThrow();
    expect(()=>noncreditSeatsAvailable({capacity:2,claims:NaN,released:0,activeInvitations:0})).toThrow();
  });
  it("requires a queue invitation when people are already waiting",()=>{
    expect(noncreditRegistrationRoute({
      seatsRemaining:1,hasWaitingQueue:true,hasValidInvitation:false,
    })).toBe("join_waitlist");
    expect(noncreditRegistrationRoute({
      seatsRemaining:0,hasWaitingQueue:true,hasValidInvitation:true,
    })).toBe("enroll");
  });
  it("admits directly when space exists and the queue is empty",()=>{
    expect(noncreditRegistrationRoute({
      seatsRemaining:3,hasWaitingQueue:false,hasValidInvitation:false,
    })).toBe("enroll");
  });
});
