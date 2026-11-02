import {describe,expect,it} from "vitest";
import {FIRST_DAY_CANONICAL_QUERY_BUDGET,FIRST_DAY_PUBLISHED_DAY_HORIZON,
 planBoundedFirstDayCandidates} from "@/domain/first-school-day-candidates";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const day=(n:number)=>new Date(Date.UTC(2026,10,1+n)).toISOString().slice(0,10);
const dates=Array.from({length:220},(_,i)=>day(i));
const timezone="America/Los_Angeles";

describe("bounded canonical first-school-day verification",()=>{
 it("never schedules more than 24 expensive canonical day projections over 180 published days",()=>{
  const plan=planBoundedFirstDayCandidates(dates,[{startedAt:null,endedAt:null}],timezone);
  expect(plan.candidates).toHaveLength(FIRST_DAY_CANONICAL_QUERY_BUDGET);
  expect(plan.eligibleDays).toBe(FIRST_DAY_PUBLISHED_DAY_HORIZON);
  expect(plan.truncated).toBe(true);
  expect(plan.candidates[0]).toBe("2026-11-01");
 });
 it("prefilters future effective placement rather than wasting calls on earlier unplaced days",()=>{
  const plan=planBoundedFirstDayCandidates(dates.slice(0,30),[
   {startedAt:new Date("2026-11-10T12:00:00Z"),endedAt:new Date("2026-11-13T08:00:00Z")},
  ],timezone);
  expect(plan.candidates).toEqual(["2026-11-10","2026-11-11","2026-11-12"]);
  expect(plan.truncated).toBe(false);
 });
 it("retains the site-local start date across UTC midnight",()=>{
  const plan=planBoundedFirstDayCandidates(dates.slice(0,12),[
   {startedAt:new Date("2026-11-06T06:00:00Z"),endedAt:null},
  ],timezone);
  expect(plan.candidates[0]).toBe("2026-11-05");
 });
 it("uses one canonical probe when no active Section membership can justify future scans",()=>{
  const plan=planBoundedFirstDayCandidates(dates,[],timezone);
  expect(plan).toEqual({candidates:["2026-11-01"],truncated:false,eligibleDays:0});
 });
 it("never treats a placement whose effective window misses published days as verified",()=>{
  const plan=planBoundedFirstDayCandidates(dates.slice(0,10),[
   {startedAt:new Date("2027-04-01T12:00:00Z"),endedAt:null},
  ],timezone);
  expect(plan).toEqual({candidates:["2026-11-01"],truncated:false,eligibleDays:0});
 });
 it("keeps all readiness and tenant checks with the canonical original resolvers",()=>{
  const source=readFileSync(resolve(process.cwd(),"src/modules/enrollment/first-school-day-handoff.functions.ts"),"utf8");
  expect(source).toContain("planBoundedFirstDayCandidates(dates,placementWindows,app.timezone)");
  expect(source).toContain("for(const candidate of scan.candidates)");
  expect(source).toContain('actor.scope.programIds?.includes(app.programId)');
  expect(source).toContain("loadExpectedFirstDayPreparationForActor(actor,");
  expect(source).toContain("loadFirstDaySupervisionPreparationForActor(actor,");
  expect(source).toContain('"verification_incomplete"');
  expect(source).toContain('"first_day_verification_limit_reached"');
  expect(source).not.toContain("for(const candidate of dates.slice(0,180))");
 });
});
