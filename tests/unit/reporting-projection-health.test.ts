import {describe,it,expect} from "vitest";
import {assessProjectionHealth,type ProjectionHealthCounts} from "@/domain/reporting-projection-health";
const counts:ProjectionHealthCounts={eligible:3,accepted:2,duplicate:1,legacy:0,retryPending:0,deadLetter:0,missing:0,normalizedMissing:0,dueRetries:0};
describe("reporting projection health",()=>{
 it("distinguishes disabled and unavailable from healthy",()=>{
  expect(assessProjectionHealth({enabled:false,storageReady:true,counts})).toBe("disabled");
  expect(assessProjectionHealth({enabled:true,storageReady:false,counts:null})).toBe("unavailable");
 });
 it("never reports missing normalized evidence as zero activity",()=>{
  expect(assessProjectionHealth({enabled:true,storageReady:true,counts:{...counts,accepted:0,missing:2,normalizedMissing:2}})).toBe("attention");
 });
 it("detects invalid accounting and distinguishes a truly empty stream",()=>{
  expect(assessProjectionHealth({enabled:true,storageReady:true,counts:{...counts,eligible:5}})).toBe("unreconciled");
  expect(assessProjectionHealth({enabled:true,storageReady:true,counts:{...counts,eligible:0,accepted:0,duplicate:0}})).toBe("no_evidence");
  expect(assessProjectionHealth({enabled:true,storageReady:true,counts})).toBe("reconciled");
 });
});
