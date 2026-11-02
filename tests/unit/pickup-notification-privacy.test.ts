import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { maySendAutomatedPickupFamilyNotice as permit } from "@/domain/pickup-notification-privacy";
describe("custody-safe family notification defaults",()=>{
  it("does not broadcast a protective hold, its resolution or a denied pickup",()=>{
    for(const event of ["hold_created","hold_resolved","pickup_denied"] as const)
      expect(permit({event})).toBe(false);
  });
  it("only sends an uncollected child notice to broad verified guardians without an active hold",()=>{
    expect(permit({event:"uncollected_child"})).toBe(true);
    expect(permit({event:"uncollected_child",activeCustodyHold:true})).toBe(false);
    expect(permit({event:"verified_release"})).toBe(true);
  });
  it("retains restricted school action and staff escalation for confidential cases",()=>{
    const code=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
    expect(code).toContain('type:"onsite_pickup_custody_hold",status:"open",priority:"urgent"');
    expect(code).toContain('type: "child_uncollected_restricted_follow_up"');
    expect(code).toContain("followUpOwnerPersonId");
    expect(code).toContain("maySendAutomatedPickupFamilyNotice({");
    expect(code).not.toContain('type: "pickup_custody_hold_created"');
    expect(code).not.toContain('type: "pickup_custody_hold_resolved"');
    expect(code).not.toContain('type: "child_pickup_denied", title:');
  });
});
