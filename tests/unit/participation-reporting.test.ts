import {describe,expect,it} from "vitest";
import {aggregateClassEvidence,type EvidenceInput} from "@/domain/participation-reporting";

const base:EvidenceInput={
 classId:"class-1",asOf:"2026-11-16T23:59:59Z",
 from:"2026-11-01T00:00:00Z",to:"2026-11-17T00:00:00Z",
 offerings:[{id:"v1",offeringId:"offer-1",state:"closed",publishedAt:"2026-11-02T00:00:00Z"},
 {id:"v2",offeringId:"offer-1",state:"published",publishedAt:"2026-11-03T00:00:00Z"}],
 enrollments:[
  {id:"e1",personId:"p1",courseAttemptId:"ca1",status:"active",enrolledAt:"2026-11-04T00:00:00Z"},
  {id:"e2",personId:"p1",courseAttemptId:"ca2",status:"withdrawn",enrolledAt:"2026-11-05T00:00:00Z"},
  {id:"e3",personId:"p2",courseAttemptId:"ca3",status:"completed",enrolledAt:"2026-11-05T00:00:00Z"}],
 sessions:[
  {id:"s1",scheduledAt:"2026-11-08T10:00:00Z",planState:"started",roomId:"r1",roomState:"ended",roomEndedAt:"2026-11-08T11:00:00Z"},
  {id:"s2",scheduledAt:"2026-11-09T10:00:00Z",planState:"scheduled",roomId:null,roomState:null,roomEndedAt:null}],
 attendance:[
  {id:"a1",roomId:"r1",courseAttemptId:"ca1",status:"present",assertedAt:"2026-11-08T10:05:00Z"},
  {id:"a2",roomId:"r1",courseAttemptId:"ca1",status:"absent",assertedAt:"2026-11-08T10:10:00Z"},
  {id:"a3",roomId:"r1",courseAttemptId:"ca3",status:"present",assertedAt:"2026-11-08T10:11:00Z"},
  {id:"a4",roomId:"unrelated-room",courseAttemptId:"ca2",status:"present",assertedAt:"2026-11-08T10:12:00Z"}],
 assessments:[
  {id:"k1",courseAttemptId:"ca3",state:"finalized",createdAt:"2026-11-07T12:00:00Z"},
  {id:"k2",courseAttemptId:"ca1",state:"submitted",createdAt:"2026-11-08T12:00:00Z"}],
 results:[
  {id:"rs1",attemptId:"k1",revision:1,status:"finalized"},
  {id:"rs2",attemptId:"k1",revision:2,status:"voided"}],
 outcomes:[{id:"o1",enrollmentId:"e3",kind:"completion",resultCode:"completed",recordedAt:"2026-11-11T12:00:00Z"}],
 awards:[{id:"aw1",outcomeId:"o1",issuedAt:"2026-11-12T12:00:00Z",revokedAt:"2026-11-14T12:00:00Z"}],
};
describe("WS6 evidence reconciliation",()=>{
 it("deduplicates people, offerings and latest attendance corrections",()=>{
   const m=aggregateClassEvidence(base).metrics;
   expect(m).toMatchObject({publishedOpportunities:1,registrations:3,uniquePeople:2,
     withdrawn:1,sessionsScheduled:2,sessionsDelivered:1,verifiedAttendance:1,
     verifiedAttendees:1,assessmentsSubmitted:2,assessmentsFinalized:0,
     formalCompletions:1,awardsIssued:1,awardsRevoked:1,waitlisted:null});
 });
 it("does not count device presence or unlinked rooms as attendance",()=>{
   const m=aggregateClassEvidence({...base,attendance:base.attendance.filter(a=>a.id==="a4")}).metrics;
   expect(m.verifiedAttendance).toBe(0);
 });
 it("fails closed on duplicated authoritative source IDs",()=>{
   expect(()=>aggregateClassEvidence({...base,enrollments:[...base.enrollments,base.enrollments[0]!]}))
     .toThrow("Duplicate");
 });
 it("does not move historical enrollment into a different period",()=>{
   const m=aggregateClassEvidence({...base,from:"2026-11-10T00:00:00Z"}).metrics;
   expect(m.registrations).toBe(0);
   expect(m.formalCompletions).toBe(0);
 });
 it("excludes prior superseded present assertions",()=>{
   expect(aggregateClassEvidence(base).metrics.verifiedAttendees).toBe(1);
 });
 it("fails on one Course Attempt being attributed to multiple people",()=>{
   const records=base.enrollments.map(x=>x.id==="e2"?{...x,courseAttemptId:"ca3"}:x);
   expect(()=>aggregateClassEvidence({...base,enrollments:records}))
     .toThrow("Course Attempt belongs to multiple people");
 });
});
