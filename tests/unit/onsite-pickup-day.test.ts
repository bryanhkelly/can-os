import { describe, expect, it } from "vitest";
import { assertCurrentPickupObservationDate } from "@/domain/onsite-pickup-day";
import { readFileSync } from "node:fs";

describe("observed onsite custody is not retroactive attendance", () => {
  it("permits the current school-local day, not yesterday or tomorrow", () => {
    expect(() => assertCurrentPickupObservationDate("2026-11-01","2026-11-01")).not.toThrow();
    expect(() => assertCurrentPickupObservationDate("2026-10-31","2026-11-01"))
      .toThrow(/current school-local day/);
    expect(() => assertCurrentPickupObservationDate("2026-11-02","2026-11-01"))
      .toThrow(/current school-local day/);
  });
  it("guards fresh release, denied attempt, and uncollected-child writes after replay", () => {
    const code=readFileSync("src/modules/operations/pickup.functions.ts","utf8");
    const records=["export const recordVerifiedPickupRelease","export const recordDeniedPickup","export const recordUncollectedChild"];
    for(let i=0;i<records.length;i++){
      const part=code.slice(code.indexOf(records[i]),i+1===records.length?undefined:code.indexOf(records[i+1]));
      const replay=part.indexOf("if (replay) {");
      const guard=part.indexOf("assertCurrentPickupObservationDate(");
      const newWrite=part.indexOf("await tx.insert(");
      expect(replay).toBeGreaterThanOrEqual(0);
      expect(guard).toBeGreaterThan(replay);
      expect(newWrite).toBeGreaterThan(guard);
    }
  });
  it("keeps historical roster visible but prevents the pickup action surface",()=>{
    const code=readFileSync("src/components/operations/OnsitePickupPanel.tsx","utf8");
    expect(code).toContain("roster.canRecordPickupObservations &&");
    expect(code).toContain("Historical school-day record");
  });
});
