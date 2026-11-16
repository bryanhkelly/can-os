import {describe,expect,it} from "vitest";
import {aggregateClassEvidence,type EvidenceInput} from "@/domain/participation-reporting";
import {rollupAuthorizedParticipation,type ParticipationReportingFact} from "@/domain/participation-rollups";

const date=(day:number)=>"2026-11-"+String(day).padStart(2,"0")+"T10:00:00Z";
const dayEnd=(day:number)=>"2026-11-"+String(day).padStart(2,"0")+"T12:00:00Z";
const period={from:"2026-11-01T00:00:00Z",to:"2026-11-17T00:00:00Z",
  asOf:"2026-11-16T22:00:00Z"};

function classFixture(classId:"classA"|"classB",size:number,delivered:number):EvidenceInput{
  const people=classId==="classA"
    ?Array.from({length:size},(_,i)=>"person"+i)
    :Array.from({length:size},(_,i)=>i===size-1?"person0":"person"+(8+i));
  const enrollments=people.map((personId,i)=>({
    id:classId+"-enroll-"+i,
    personId,courseAttemptId:classId+"-attempt-"+i,
    status:"active" as const,enrolledAt:date(2),
  }));
  const sessions=Array.from({length:2},(_,i)=>({
    id:classId+"-session-"+i,scheduledAt:date(6+i),
    planState:i<delivered?"started":"scheduled",
    roomId:i<delivered?classId+"-room-"+i:null,
    roomState:i<delivered?"ended":null,
    roomEndedAt:i<delivered?dayEnd(6+i):null,
  }));
  const attendance=Array.from({length:delivered},(_,i)=>({
    id:classId+"-attested-"+i,roomId:classId+"-room-"+i,
    courseAttemptId:classId+"-attempt-"+i,
    status:"present" as const,assertedAt:date(6+i),
  }));
  return {
    classId,asOf:period.asOf,from:period.from,to:period.to,
    offerings:[{id:classId+"-v1",offeringId:classId+"-offering",
      state:"published",publishedAt:date(1)}],
    enrollments,sessions,attendance,assessments:[],results:[],
    outcomes:[],awards:[],
  };
}
describe("WS6 one-hour and four-Session/two-Site synthetic pilot acceptance",()=>{
 it("aggregates four scheduled Sessions but only three actually delivered",()=>{
   const siteA=classFixture("classA",8,2);
   const siteB=classFixture("classB",6,1);
   const a=aggregateClassEvidence(siteA).metrics;
   const b=aggregateClassEvidence(siteB).metrics;
   expect(a.sessionsScheduled!+b.sessionsScheduled!).toBe(4);
   expect(a.sessionsDelivered!+b.sessionsDelivered!).toBe(3);
   expect(a.verifiedAttendance!+b.verifiedAttendance!).toBe(3);
   expect(a.registrations!+b.registrations!).toBe(14);
 });
 it("does not sum distinct Site people as network-wide unique participants",()=>{
   const fixtures=[classFixture("classA",8,2),
      classFixture("classB",6,1)];
   const facts:ParticipationReportingFact[]=fixtures.flatMap((f,i)=>
     f.enrollments.map(e=>({
       source:"native_class_enrollment",sourceId:e.id,personId:e.personId,
       courseVersionId:"training-course",programId:"pilot-program",
       deliverySiteId:i===0?"siteA":"siteB",
       operatingOrganizationId:"authorized-operator",
       creditedOrganizationId:null,registeredAt:e.enrolledAt,currentStatus:e.status,
     })));
   const totals=rollupAuthorizedParticipation(facts,{
     verifiedOrganizationIds:new Set(["authorized-operator"]),
     verifiedSiteIds:new Set(["siteA","siteB"]),
   },period);
   expect(totals.totals).toMatchObject({registrations:14,uniquePeople:13});
   expect(totals.sites.reduce((n,s)=>n+s.uniquePeople,0)).toBe(14);
 });
 it("does not convert one prior registration into a new registration when attending later",()=>{
   const f=classFixture("classA",8,1);
   const later=aggregateClassEvidence({...f,from:date(6)}).metrics;
   expect(later.registrations).toBe(0);
   expect(later.verifiedAttendance).toBe(1);
   expect(later.sessionsDelivered).toBe(1);
 });
 it("latest correction after the report snapshot is excluded",()=>{
   const f=classFixture("classA",8,1);
   const after=[
     ...f.attendance,
     {id:"correction-next-month",roomId:"classA-room-0",
       courseAttemptId:"classA-attempt-0",
       status:"absent" as const,assertedAt:"2026-12-01T10:00:00Z"},
   ];
   expect(aggregateClassEvidence({...f,attendance:after}).metrics.verifiedAttendance).toBe(1);
 });
 it("does not substitute device or playback evidence for verified attendance",()=>{
   const f=classFixture("classA",8,1);
   expect(aggregateClassEvidence({...f,attendance:[]}).metrics.verifiedAttendance).toBe(0);
   expect(aggregateClassEvidence({...f,attendance:[]}).metrics.sessionsDelivered).toBe(1);
 });
});
