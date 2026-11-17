import {describe,expect,it} from "vitest";
import {OUTBOUND_LEASE_MS,OUTBOUND_MAX_ATTEMPTS,outboundRetryDelayMs} from "@/domain/outbound-retry-policy";
describe("consistent source-owned outbound delivery retries",()=>{
 it("keeps current lease and bounded retry budgets",()=>{
  expect(OUTBOUND_LEASE_MS).toBe(120_000);
  expect(OUTBOUND_MAX_ATTEMPTS).toBe(5);
  expect([1,2,3,4,5,7].map(outboundRetryDelayMs))
   .toEqual([60_000,120_000,240_000,480_000,960_000,3_600_000]);
 });
});
