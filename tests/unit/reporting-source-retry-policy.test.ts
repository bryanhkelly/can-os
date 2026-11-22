import { describe, expect, it } from "vitest";
import { reportingProjectionRetryDelayMs } from "@/domain/reporting-source-retry-policy";

describe("reporting source replay retry timing",()=>{
  it("uses a bounded exponential retry schedule",()=>{
    expect(reportingProjectionRetryDelayMs(1)).toBe(300000);
    expect(reportingProjectionRetryDelayMs(2)).toBe(600000);
    expect(reportingProjectionRetryDelayMs(100)).toBe(86400000);
  });
  it("never accepts invalid attempts",()=>{
    expect(()=>reportingProjectionRetryDelayMs(0)).toThrow();
    expect(()=>reportingProjectionRetryDelayMs(Number.NaN)).toThrow();
  });
});
