import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("onsite proposal and approval use separate verified roles",()=>{
 it("assigns the proposal UI to onsite staff, and final resolution to the site director",()=>{
   const server=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
   const roster=server.slice(server.indexOf("export const getOnsitePickupRoster"),server.indexOf("export const recordVerifiedPickupRelease"));
   const ui=readFileSync("src/components/operations/OnsitePickupPanel.tsx","utf8");
   expect(roster).toContain('canResolveHolds: actor.role === "site_leader"');
   expect(roster).toContain('canProposeHoldResolution: ["room_facilitator", "site_staff"].includes(actor.role)');
   expect(ui).toContain("roster.canProposeHoldResolution && !hold.pendingResolution");
   expect(ui).toContain("roster.canResolveHolds && hold.pendingResolution");
   expect(ui).toContain("sectionId: student.sectionId ?? undefined");
   const proposal=server.slice(server.indexOf("export const proposePickupCustodyResolution"),server.indexOf("export const resolvePickupCustodyHold"));
   expect(proposal).toContain('["room_facilitator","site_staff"].includes(actor.role)');
   expect(proposal).toContain("if(!data.sectionId)");
 });
});
