import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/modules/operations/onsite-physical-presence.functions.ts","utf8");
const departure=source.slice(source.indexOf("export const reportOnsiteStaffCoverageInterruption"),
  source.indexOf("export const witnessOnsiteBlockPresence"));
const witness=source.slice(source.indexOf("export const witnessOnsiteBlockPresence"),
  source.indexOf("export const loadOnsitePhysicalPresenceForActor"));

describe("adult departure and director witness are serialized",()=>{
 it("locks the same date, room and period before accepting an interruption",()=>{
   expect(departure).toContain('"onsite-presence:"+site.id+":"+data.date+":"+presence.sectionId+":"+presence.metadata.periodId');
   expect(departure.indexOf('"onsite-presence:"')).toBeLessThan(departure.indexOf('"onsite-staff-exit:"'));
 });
 it("rejects new witnessing of a room whose exact named adult has departed",()=>{
   const lock=witness.indexOf('"onsite-presence:"');
   const read=witness.indexOf("const [departure]");
   const create=witness.indexOf("await tx.insert(actions).values({");
   expect(lock).toBeGreaterThan(0);
   expect(read).toBeGreaterThan(lock);
   expect(read).toBeLessThan(create);
   expect(witness).toContain("inArray(actions.ownerPersonId,adults)");
   expect(witness).toContain("eq(actions.type,exitType)");
   expect(witness).toContain("eq(actions.sectionId,block.sectionId)");
   expect(witness).toContain("named classroom adult reported leaving");
 });
});
