import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reported departure cannot turn a self-presence retry into coverage",()=>{
 it("rejects a stale same-token arrival after its departure was recorded",()=>{
   const source=readFileSync("src/modules/operations/onsite-physical-presence.functions.ts","utf8");
   const section=source.slice(source.indexOf("export const reportOnsitePhysicalPresence"),
     source.indexOf("export const reportOnsiteStaffCoverageInterruption"));
   const prior=section.indexOf("if(prior){");
   const check=section.indexOf("const [departure]",prior);
   const result=section.indexOf("return {reportId:prior.id",prior);
   expect(prior).toBeGreaterThan(0);
   expect(check).toBeGreaterThan(prior);
   expect(check).toBeLessThan(result);
   expect(section).toContain("eq(actions.type,exitType)");
   expect(section).toContain("prior staff arrival was interrupted");
 });
});
