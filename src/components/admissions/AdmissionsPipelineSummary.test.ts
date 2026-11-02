import {describe,expect,it} from "vitest";
import {ADMISSIONS_STAGES,countAdmissionsStages} from "./AdmissionsPipelineSummary";

describe("admissions pipeline presentation",()=>{
 it("counts canonical stages without changing application records",()=>{
  const records=[{id:"a",stage:"inquiry"},{id:"b",stage:"accepted"},{id:"c",stage:"accepted"}];
  const before=JSON.stringify(records);
  const counts=countAdmissionsStages(records);
  expect(counts.find(row=>row.stage==="accepted")?.count).toBe(2);
  expect(counts.find(row=>row.stage==="application")?.count).toBe(0);
  expect(counts.map(row=>row.stage)).toEqual([...ADMISSIONS_STAGES]);
  expect(JSON.stringify(records)).toBe(before);
 });
 it("does not mistake an unrecognized stage for acceptance",()=>{
  expect(countAdmissionsStages([{stage:"offer_issued"},{stage:"enrolled"}]).find(row=>row.stage==="accepted")?.count).toBe(0);
 });
});
