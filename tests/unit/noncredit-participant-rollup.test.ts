import {describe,it,expect} from "vitest";
import {summarizeDistinctNoncreditParticipation,type NoncreditParticipantFact} from "@/domain/noncredit-participant-rollup";
const a:NoncreditParticipantFact={registrationId:"r1",personId:"p1",siteId:"s1",releaseId:"c1",completed:true,verifiedAttendance:true};
describe("distinct noncredit participant rollups",()=>{
 it("counts repeat participation across Sites without inflating national people",()=>{
  const result=summarizeDistinctNoncreditParticipation([a,{...a,registrationId:"r2",siteId:"s2",releaseId:"c2"},{...a,registrationId:"r3",personId:"p2",completed:false,verifiedAttendance:false}]);
  expect(result.totals).toEqual({uniquePeople:2,uniqueCompletedPeople:1,uniqueVerifiedAttendees:1,repeatRegistrations:1});
  expect(result.bySite.get("s1")?.uniquePeople).toBe(2);
  expect(result.bySite.get("s2")?.uniquePeople).toBe(1);
 });
 it("rejects duplicated registrations and conflicting release ownership",()=>{
  expect(()=>summarizeDistinctNoncreditParticipation([a,a])).toThrow();
  expect(()=>summarizeDistinctNoncreditParticipation([a,{...a,registrationId:"r2",siteId:"s2"}])).toThrow();
 });
 it("returns only counts and no individual identities",()=>{
  const result=summarizeDistinctNoncreditParticipation([a]);
  expect(JSON.stringify(result.totals)).not.toContain(a.personId);
  expect(summarizeDistinctNoncreditParticipation([]).totals.uniquePeople).toBe(0);
 });
});
