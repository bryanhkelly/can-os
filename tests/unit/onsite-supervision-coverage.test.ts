import { describe, expect, it } from "vitest";
import {
  coversLocalSupervisionBlock, summarizeOnsiteSupervision,
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
  it("respects site-local shift effective times, not UTC day estimates",()=>{
    const interval={
      date:"2026-10-22",timeZone:"America/Los_Angeles",
      startsAtLocal:"09:00:00",endsAtLocal:"10:00:00",
      effectiveFrom:new Date("2026-10-22T16:00:00Z"),
      effectiveThrough:new Date("2026-10-22T17:00:00Z"),
    };
    expect(coversLocalSupervisionBlock(interval)).toBe(true);
    expect(coversLocalSupervisionBlock({
      ...interval,effectiveFrom:new Date("2026-10-22T16:15:00Z"),
    })).toBe(false);
    expect(coversLocalSupervisionBlock({
      ...interval,effectiveThrough:new Date("2026-10-22T16:45:00Z"),
    })).toBe(false);
    expect(coversLocalSupervisionBlock({
      ...interval,startsAtLocal:"17:00",endsAtLocal:"16:00",
    })).toBe(false);
  });

  it("labels assigned staff as PLANNED, never physically confirmed or room assigned",()=>{
    const result=summarizeOnsiteSupervision([period()]);
    expect(result.plannedAssignments).toBe(1);
    expect(result.hasConfirmedPhysicalCoverage).toBe(false);
    expect(result.roomAssignmentsUnverified).toBe(1);
    expect(result.blocks[0]).toMatchObject({
      assignedPlan:true,gaps:["room_unconfigured"],
    });
    expect(result.note).toMatch(/not a school-opening or physically supervised-day approval/i);
  });
  it("does not treat a recurring timetable as an instructional duty on a closed or unconfigured day",()=>{
    for(const confirmed of [false]){
      const result=summarizeOnsiteSupervision([
        period({instructionalDayConfirmed:confirmed}),
      ]);
      expect(result.plannedAssignments).toBe(0);
      expect(result.unassignedOrConflicting).toBe(1);
      expect(result.blocks[0]?.gaps).toContain("calendar_unverified");
      expect(result.blocks[0]?.assignedPlan).toBe(false);
      expect(result.hasConfirmedPhysicalCoverage).toBe(false);
    }
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
  it("does not count a church/CAN Section without its named effective delegation",()=>{
    const missing=summarizeOnsiteSupervision([period({
      requiresSectionDelegation:true, verifiedSectionDelegation:false,
      authorizedSupervisionService:true, instructionalDayConfirmed:true,
    })]);
    expect(missing.plannedAssignments).toBe(0);
    expect(missing.blocks[0]?.gaps).toContain("section_delegation_missing");
    expect(missing.hasConfirmedPhysicalCoverage).toBe(false);

    const expiredAgreement=summarizeOnsiteSupervision([period({
      requiresSectionDelegation:true, verifiedSectionDelegation:true,
      authorizedSupervisionService:false, instructionalDayConfirmed:true,
    })]);
    expect(expiredAgreement.plannedAssignments).toBe(0);
    expect(expiredAgreement.blocks[0]?.gaps).toContain("operating_agreement_missing");

    const planned=summarizeOnsiteSupervision([period({
      requiresSectionDelegation:true, verifiedSectionDelegation:true,
      authorizedSupervisionService:true, instructionalDayConfirmed:true,
      verifiedSafeguardingScreening:true,verifiedSafeguardingTraining:true,
      roomPlanVerified:true,roomLabel:"Classroom A",roomCapacityAdequate:true,
      backupPersonId:"backup-1",namedBackupVerified:true,
    })]);
    expect(planned.plannedAssignments).toBe(1);
    expect(planned.blocks[0]?.gaps).toEqual([]);
    expect(planned.hasConfirmedPhysicalCoverage).toBe(false);
  });
  it("a valid Site grant or contract alone never makes a church/CAN class staffed",()=>{
    const result=summarizeOnsiteSupervision([period({
      requiresSectionDelegation:true,
      verifiedSiteStaffGrant:true,
      verifiedSectionDelegation:false,
      authorizedSupervisionService:false,
    })]);
    expect(result.blocks[0]?.gaps).toEqual(expect.arrayContaining([
      "section_delegation_missing","operating_agreement_missing","room_unconfigured",
    ]));
    expect(result.unassignedOrConflicting).toBe(1);
  });


  it("blocks a church school plan and affirmative duty until screening, training, room and backup are verified",()=>{
    const minimum={
      requiresSectionDelegation:true,verifiedSectionDelegation:true,
      authorizedSupervisionService:true,instructionalDayConfirmed:true,
    };
    const unsafe=summarizeOnsiteSupervision([period(minimum)]);
    expect(unsafe.plannedAssignments).toBe(0);
    expect(unsafe.blocks[0]?.gaps).toEqual(expect.arrayContaining([
      "child_safety_screening_missing","safeguarding_training_missing",
      "qualified_backup_missing","room_unconfigured",
    ]));
    const stillUnsafe=summarizeOnsiteSupervision([period({
      ...minimum,verifiedSafeguardingScreening:true,verifiedSafeguardingTraining:true,
      roomPlanVerified:true,roomLabel:"Learning Center",
      roomCapacityAdequate:false,namedBackupVerified:true,
      backupPersonId:"qualified-backup",
    })]);
    expect(stillUnsafe.blocks[0]?.gaps).toContain("room_capacity_unverified");
    expect(stillUnsafe.plannedAssignments).toBe(0);
    expect(stillUnsafe.hasConfirmedPhysicalCoverage).toBe(false);
  });
  it("rejects simultaneous standby-backup assignments to a second Section",()=>{
    const ready={
      requiresSectionDelegation:true,verifiedSectionDelegation:true,
      authorizedSupervisionService:true,instructionalDayConfirmed:true,
      verifiedSafeguardingScreening:true,verifiedSafeguardingTraining:true,
      roomPlanVerified:true,roomCapacityAdequate:true,namedBackupVerified:true,
    };
    const result=summarizeOnsiteSupervision([
      period({...ready,sectionId:"algebra",facilitatorPersonId:"primary-a",
        backupPersonId:"same-backup"}),
      period({...ready,sectionId:"science",periodId:"science",
        facilitatorPersonId:"primary-b",backupPersonId:"same-backup"}),
    ]);
    expect(result.plannedAssignments).toBe(0);
    expect(result.blocks.every(block=>block.gaps.includes("facilitator_conflict"))).toBe(true);
  });
  it("rejects two simultaneous Sections using the same verified room",()=>{
    const ready={
      requiresSectionDelegation:true,verifiedSectionDelegation:true,
      authorizedSupervisionService:true,instructionalDayConfirmed:true,
      verifiedSafeguardingScreening:true,verifiedSafeguardingTraining:true,
      roomPlanVerified:true,roomCapacityAdequate:true,namedBackupVerified:true,
    };
    const result=summarizeOnsiteSupervision([
      period({...ready,sectionId:"math",facilitatorPersonId:"primary-1",
        roomLabel:"Learning Hall A",backupPersonId:"backup-1"}),
      period({...ready,sectionId:"science",facilitatorPersonId:"primary-2",
        roomLabel:" learning hall a ",backupPersonId:"backup-2"}),
    ]);
    expect(result.plannedAssignments).toBe(0);
    expect(result.blocks.every(block=>block.gaps.includes("room_schedule_conflict"))).toBe(true);
    expect(result.hasConfirmedPhysicalCoverage).toBe(false);
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
