import {describe,expect,it} from "vitest";
import {fixtureRecommendations} from "@/domain/synthetic-fixture-recommendations";
describe("synthetic demo fixture guidance",()=>{
 it("identifies missing P0 fixtures and lifecycle scenarios",()=>{
  const result=fixtureRecommendations([{key:"admissions",count:0,minimum:1,ok:false},{key:"groups",count:2,minimum:1,ok:true}],{fresh:0,accepted:0,active:0,blocked:0});
  expect(result.map(x=>x.key)).toEqual(["admissions","scenario-fresh","scenario-accepted","scenario-active","scenario-blocked"]);
  expect(result[0]?.critical).toBe(true);
  expect(result.some(x=>x.key==="groups")).toBe(false);
 });
 it("does not claim missing fixtures when all minimums and scenarios are present",()=>{
  expect(fixtureRecommendations([{key:"admissions",count:2,minimum:1,ok:true}],{fresh:1,accepted:1,active:1,blocked:1})).toEqual([]);
 });
});