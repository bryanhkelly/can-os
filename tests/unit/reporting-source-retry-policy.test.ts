import { describe, expect, it } from "vitest";
import { reportingProjectionFailureState,
  reportingProjectionRetryDelayMs } from "@/domain/reporting-source-retry-policy";

describe("reporting source replay retry timing",()=>{
  it("uses a bounded exponential retry schedule",()=>{
    expect(reportingProjectionRetryDelayMs(1)).toBe(300000);
    expect(reportingProjectionRetryDelayMs(2)).toBe(600000);
    expect(reportingProjectionRetryDelayMs(100)).toBe(86400000);
  });
  it("moves terminal failures to an immutable dead-letter state",()=>{
    expect(reportingProjectionFailureState(1)).toBe("retry_pending");
    expect(reportingProjectionFailureState(4)).toBe("retry_pending");
    expect(reportingProjectionFailureState(5)).toBe("dead_letter");
    expect(reportingProjectionFailureState(100)).toBe("dead_letter");
  });
  it("never accepts invalid attempts",()=>{
    expect(()=>reportingProjectionRetryDelayMs(0)).toThrow();
    expect(()=>reportingProjectionRetryDelayMs(Number.NaN)).toThrow();
  });
});
