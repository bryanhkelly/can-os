import {describe,expect,it} from "vitest";
import {assertParticipationHistoryPage} from "@/domain/participation-history-pages";
import {assembleParticipation,projectSchoolSections} from
  "@/domain/participation-projections";
import type {ParticipationRecord} from "@/domain/participation-read-model";
const now=new Date("2026-11-17T00:00:00.000Z");
const id=(n:number)=>"00000000-0000-4000-8000-"+n.toString().padStart(12,"0");
const row=(n:number):ParticipationRecord=>projectSchoolSections([{
  id:id(2),title:"Historic Section",code:"HIS",
  enrollmentId:id(n),enrollmentStatus:"withdrawn",
  organizationId:id(5000+n%2),siteId:id(6000+n%2),
  subject:{kind:n%3===0?"dependent":"self",displayName:null},
}],now)[0]!;
describe("unbounded, source-owned My Activity pagination",()=>{
 it("keeps all 720 source enrollments beyond both historic 100 and 500 limits",()=>{
  const displayed:ParticipationRecord[]=[];
  let previousCursor="first";
  for(let page=0;page<18;page++){
    const next=String(page+1);
    const batch=Array.from({length:40},(_,i)=>row(page*40+i+1));
    assertParticipationHistoryPage({
      source:"school_section",previousCursor,
      nextCursor:page===17?null:next,items:batch,alreadyDisplayed:displayed,
    });
    displayed.push(...batch);previousCursor=next;
  }
  expect(assembleParticipation(displayed)).toHaveLength(720);
  expect(new Set(displayed.map(item=>item.siteId)).size).toBe(2);
  expect(displayed.some(item=>item.subject.kind==="dependent")).toBe(true);
 });
 it("rejects duplicate source IDs and stale cursor loops",()=>{
  const first=row(1);
  expect(()=>assertParticipationHistoryPage({
    source:"school_section",previousCursor:"A",nextCursor:"B",
    items:[first],alreadyDisplayed:[first],
  })).toThrow(/Duplicate/);
  expect(()=>assertParticipationHistoryPage({
    source:"school_section",previousCursor:"A",nextCursor:"A",
    items:[row(2)],alreadyDisplayed:[],
  })).toThrow(/did not advance/);
  expect(()=>assertParticipationHistoryPage({
    source:"school_section",previousCursor:"A",nextCursor:"B",
    items:[],alreadyDisplayed:[],
  })).toThrow(/did not advance/);
 });
 it("rejects wrong-source rows without confusing identical IDs across sources",()=>{
  const first=row(1);
  expect(()=>assertParticipationHistoryPage({
    source:"calendar_event",previousCursor:"A",nextCursor:null,
    items:[first],alreadyDisplayed:[],
  })).toThrow(/mismatched/);
  const other={...first,key:"calendar_event:"+first.sourceId,
    source:"calendar_event" as const};
  expect(()=>assertParticipationHistoryPage({
    source:"calendar_event",previousCursor:"A",nextCursor:null,
    items:[other],alreadyDisplayed:[first],
  })).not.toThrow();
 });
});
