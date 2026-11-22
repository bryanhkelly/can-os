import { describe, expect, it } from "vitest";
import { assertSnapshotSourceReadiness } from "@/domain/reporting-snapshot-readiness";

describe("private source snapshot readiness",()=>{
  const complete={
    observedEvents:2,
    sourceCoverage:{status:"source_normalized" as const,
      lifecycleCompletenessVerified:false as const},
  };
  it("permits only normalized and nonempty private source evidence",()=>{
    expect(()=>assertSnapshotSourceReadiness(complete)).not.toThrow();
    expect(()=>assertSnapshotSourceReadiness({
      ...complete,observedEvents:0,
    })).toThrow("reconciled");
    expect(()=>assertSnapshotSourceReadiness({
      ...complete,sourceCoverage:{...complete.sourceCoverage,
        status:"source_unreconciled"},
    })).toThrow("reconciled");
  });
  it("does not require, or imply, verified business lifecycle completeness",()=>{
    expect(complete.sourceCoverage.lifecycleCompletenessVerified).toBe(false);
  });
});
