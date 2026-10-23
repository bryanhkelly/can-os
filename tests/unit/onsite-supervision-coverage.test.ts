import { describe, expect, it } from "vitest";
import {
  summarizeOnsiteSupervision,
  type SupervisionBlockInput,
} from "@/domain/onsite-supervision-coverage";

const period=(patch:Partial<SupervisionBlockInput>={}):SupervisionBlockInput=>({
  sectionId:"algebra",sectionTitle:"Algebra",programId:"can-program",
  programName:"CAN Academy",
  periodId:"block-morning",periodLabel:"Instruction",
  startsAtLocal:"09:00:00",endsAtLocal:"10:00:00",
  facilitatorPersonId:"facilitator-1",facilitatorName:"Ms. Jordan",
  verifiedSiteStaffGrant:true,...patch,
});

describe("planned hybrid onsite section supervision",()=>{
  it("labels assigned staff as PLANNED, never physically confirmed or room assigned",()=>{
    const result=summarizeOnsiteSupervision([period()]);
    expect(result.plannedAssignments).toBe(1);
    expect(result.hasConfirmedPhysicalCoverage).toBe(false);
    expect(result.roomAssignmentsUnverified).toBe(1);
    expect(result.blocks[0]).toMatchObject({
      assignedPlan:true,gaps:["room_unconfigured"],
    });
    expect(result.note).toMatch(/not.*onsite presence/i);
  });
  it("reports missing schedules, facilitators and active site authorizations",()=>{
    const result=summarizeOnsiteSupervision([
      period({sectionId:"section-a",periodId:null,
        startsAtLocal:null,endsAtLocal:null}),
      period({sectionId:"section-b",facilitatorPersonId:null,
        facilitatorName:null}),
      period({sectionId:"section-c",verifiedSiteStaffGrant:false}),
    ]);
    expect(result.plannedAssignments).toBe(0);
    expect(result.unassignedOrConflicting).toBe(3);
    expect(result.blocks[0]?.gaps).toContain("schedule_missing");
    expect(result.blocks[1]?.gaps).toContain("facilitator_missing");
    expect(result.blocks[2]?.gaps).toContain("staff_grant_missing");
  });
  it("flags double-booked adult across overlapping sections without inferring custody",()=>{
    const result=summarizeOnsiteSupervision([
      period({sectionId:"algebra",startsAtLocal:"09:00",endsAtLocal:"10:30"}),
      period({sectionId:"science",periodId:"science-1",
        startsAtLocal:"10:00",endsAtLocal:"11:00"}),
    ]);
    expect(result.unassignedOrConflicting).toBe(2);
    expect(result.blocks.every(x=>x.gaps.includes("facilitator_conflict"))).toBe(true);
    expect(result.hasConfirmedPhysicalCoverage).toBe(false);
  });
  it("allows adjacent periods for one adult and does not conflict within the SAME section",()=>{
    const result=summarizeOnsiteSupervision([
      period(),
      period({sectionId:"science",periodId:"science",startsAtLocal:"10:00",endsAtLocal:"11:00"}),
      period({sectionId:"algebra",periodId:"algebra-2",
        startsAtLocal:"09:30",endsAtLocal:"09:45"}),
    ]);
    expect(result.unassignedOrConflicting).toBe(0);
    expect(result.plannedAssignments).toBe(3);
  });
  it("marks malformed or overlapping facilitator plans incomplete",()=>{
    const result=summarizeOnsiteSupervision([
      period({startsAtLocal:"25:00",endsAtLocal:"10:00"}),
      period({sectionId:"science",periodId:"science-1",
        overlappingFacilitatorAssignments:true}),
    ]);
    expect(result.blocks[0]?.gaps).toContain("schedule_missing");
    expect(result.blocks[1]?.gaps).toContain("facilitator_conflict");
    expect(result.plannedAssignments).toBe(0);
  });
});
