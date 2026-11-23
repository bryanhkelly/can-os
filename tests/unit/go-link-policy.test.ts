import { describe, expect, it } from "vitest";
import { goLinkAvailability, goLinkManagementSchema,
  goLinkStatusTransition } from "@/domain/go-link-policy";

const time=new Date("2026-11-23T21:00:00.000Z");
const earlier=new Date("2026-11-23T20:00:00.000Z");
const later=new Date("2026-11-23T22:00:00.000Z");
describe("Go Link lifecycle policy",()=>{
  it("allows an immediate or scheduled active link only inside its window",()=>{
    expect(goLinkAvailability({status:"active",startsAt:null,expiresAt:null},time)).toBe("available");
    expect(goLinkAvailability({status:"active",startsAt:later,expiresAt:null},time)).toBe("scheduled");
    expect(goLinkAvailability({status:"active",startsAt:earlier,expiresAt:later},time)).toBe("available");
    expect(goLinkAvailability({status:"active",startsAt:null,expiresAt:time},time)).toBe("expired");
    expect(goLinkAvailability({status:"active",startsAt:earlier,expiresAt:earlier},time)).toBe("expired");
  });
  it("paused and revoked states override scheduled and active windows",()=>{
    expect(goLinkAvailability({status:"paused",startsAt:later,expiresAt:earlier},time)).toBe("paused");
    expect(goLinkAvailability({status:"revoked",startsAt:null,expiresAt:null},time)).toBe("revoked");
  });
  it("a revoked code cannot be reactivated",()=>{
    expect(goLinkStatusTransition("active","paused")).toBe("paused");
    expect(goLinkStatusTransition("paused","active")).toBe("active");
    expect(goLinkStatusTransition("paused","revoked")).toBe("revoked");
    expect(()=>goLinkStatusTransition("revoked","active")).toThrow("permanent");
    expect(()=>goLinkStatusTransition("revoked","paused")).toThrow("permanent");
  });
  it("validates names, channel and chronological activation in management",()=>{
    expect(goLinkManagementSchema.safeParse({name:"AI Pilot",channel:"flyer"}).success).toBe(true);
    expect(goLinkManagementSchema.safeParse({name:" ",channel:"email"}).success).toBe(false);
    expect(goLinkManagementSchema.safeParse({name:"AI Pilot",channel:"bad"}).success).toBe(false);
    expect(goLinkManagementSchema.safeParse({
      name:"AI Pilot",startsAt:"2026-11-23T22:00:00Z",expiresAt:"2026-11-23T21:00:00Z",
    }).success).toBe(false);
  });
});
