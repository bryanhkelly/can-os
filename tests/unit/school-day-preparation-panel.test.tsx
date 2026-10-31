import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SchoolDayPreparationPanel } from "@/components/operations/SchoolDayPreparationPanel";
vi.mock("@/components/operations/OnsiteRoomPlanningPanel",()=>({OnsiteRoomPlanningPanel:()=> <p>Room and adult planning controls</p>}));
const model={date:"2026-11-02",siteId:"site",timezone:"America/Los_Angeles",projectionTruncated:false,
  programs:[{id:"program",name:"School",configuration:"configured",expectedDays:1,missingCalendarDates:0}],
  students:[{studentProfileId:"placed",studentName:"Placed student",programId:"program"}],
  sectionMemberships:[{studentProfileId:"placed",studentName:"Placed student",programId:"program",sectionId:"section",sectionTitle:"Science"}],
  unplacedStudents:[{studentProfileId:"unplaced",studentName:"Needs placement",programId:"program"}],
  blocks:[{sectionId:"section",programId:"program",programName:"School",sectionTitle:"Science",periodId:"period",periodLabel:"Morning",
    startsAtLocal:"09:00",endsAtLocal:"10:00",facilitatorName:"Named primary",backupFacilitatorName:"Named backup",roomLabel:null,
    gaps:["room_unconfigured"],assignedPlan:false,requiresSectionDelegation:true}],
  note:"Preparation records no attendance, staff arrival or custody release.",
};
describe("prepare tomorrow through the existing school workspace",()=>{
  it("connects expected Section students to the room and adult work still required",()=>{
    const html=renderToStaticMarkup(<SchoolDayPreparationPanel preparation={model as never} onChanged={()=>{}}/>);
    for(const text of ["Science","Placed student","Needs placement","Named primary","Named backup","Room plan needs review","Room and adult planning controls"])
      expect(html).toContain(text);
    expect(html).toContain("excluded from the supervised attendance roster until placement is completed");
    for(const text of ["Record present","Verify release","I personally witnessed"])
      expect(html).not.toContain(text);
  });
});
