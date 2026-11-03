import { describe, expect, it } from "vitest";
import { deriveSiteOperatingDecision } from "@/domain/site-operating-decision";

const witnessed = {
  assignedPlan: true, substitution: false, missingAdultReports: 0,
  dutyStatus: "can_cover", coverageInterrupted: false, witnessedBothAdults: true,
};
const base = {
  programIds: ["program-a"],
  openings: [{programId:"program-a",blocked:false}],
  handoffs: [{programId:"program-a",status:"resolved"}],
  staffing: {
    blocks: [witnessed], coverageExceptions: 0, interruptedBlocks: 0,
    missingAdultReports: 0, witnessedBlocks: 1,
  },
  projectionTruncated: false,
};
describe("site operating decision never invents opening authority", () => {
  it("fails closed when a registrar cannot access opening evidence", () => {
    expect(deriveSiteOperatingDecision({...base,openings:[]}).status).toBe("opening_unverified");
  });
  it("fails closed when one of multiple scoped programs has no opening evidence", () => {
    const result = deriveSiteOperatingDecision({
      ...base, programIds: ["program-a", "program-b"],
    });
    expect(result.status).toBe("opening_unverified");
  });
  it("does not accept a different program's approval as the scoped school's approval", () => {
    const result = deriveSiteOperatingDecision({
      ...base, openings: [{ programId: "program-b", blocked: false }],
    });
    expect(result.status).toBe("opening_unverified");
  });
  it("makes an independent opening blocker more urgent than staffing", () => {
    expect(deriveSiteOperatingDecision({
      ...base,openings:[{programId:"program-a",blocked:true}],
      staffing:{...base.staffing,blocks:[{...witnessed,assignedPlan:false}]},
    }).status).toBe("opening_blocked");
  });
  it("does not call an active but unwitnessed school day ready", () => {
    const result = deriveSiteOperatingDecision({
      ...base,staffing:{...base.staffing,blocks:Array.from({length:10},()=>({
        ...witnessed,assignedPlan:false,witnessedBothAdults:false,
      })),witnessedBlocks:0},
    });
    expect(result.status).toBe("coverage_review");
    expect(result.staffingExceptionCount).toBe(10);
  });
  it("requires an acknowledged handoff after evidence is complete", () => {
    expect(deriveSiteOperatingDecision({...base,handoffs:[]}).status).toBe("handoff_review");
  });
  it("does not call a capped projection trustworthy", () => {
    expect(deriveSiteOperatingDecision({...base,projectionTruncated:true}).status).toBe("opening_unverified");
  });
  it("reports supporting records without pretending to certify opening", () => {
    const d=deriveSiteOperatingDecision(base);
    expect(d.status).toBe("evidence_present");
    expect(d.detail).toContain("not an independent safety certification");
  });
});
