import {describe,expect,it} from "vitest";
import {guidedSchoolJourney, isGuidedAcademicSchool, type SchoolProgramRecord} from "@/domain/guided-school-journey";
import {prioritizeSchoolActions,schoolActionBacklog} from "@/domain/operations-action-triage";

const program:SchoolProgramRecord={
  id:"12345678-1234-4234-8234-123456789012",
  name:"CAN High School",status:"launching",type:"high_school_extension",
  siteId:"22345678-1234-4234-8234-123456789012",
  academicProviderOrganizationId:"school",creditIssuingOrganizationId:"issuer",
  counts:{
    adoptedCurriculumPacks:0,sections:0,publishedSections:0,staffedSections:0,
    applications:0,incomingApplications:0,outstandingEnrollmentRequirements:0,
    acceptedApplications:0,activeProgramStudents:0,
    placedStudents:0,publishedAssessments:0,submittedWork:0,
    gradedWork:0,unresolvedGuardianResponses:0,
  },
};

describe("guided school launch",()=>{
  it("shows independent church academies but not enrichment in school guidance",()=>{
    expect(isGuidedAcademicSchool("church_hosted_academy")).toBe(true);
    expect(isGuidedAcademicSchool("high_school_extension")).toBe(true);
    expect(isGuidedAcademicSchool("summer_enrichment")).toBe(false);
    expect(isGuidedAcademicSchool("after_school_enrichment")).toBe(false);
  });
  it("sends schools without applicants to the real registrar intake, not website publishing",()=>{
    const steps=guidedSchoolJourney({...program,type:"church_hosted_academy"},null);
    expect(steps[2]?.nextAction).toBe("Start your first family intake");
    expect(steps[2]?.href).toContain("/admissions/intake?programId=");
    expect(steps[2]?.href).toContain("&siteId=");
    const started=guidedSchoolJourney({...program,counts:{...program.counts,applications:1}},null);
    expect(started[2]?.href).toContain("/admissions?programId=");
    expect(started[2]?.href).not.toContain("/admissions/intake");
  });

  it("never turns an empty launch into an approved or successful school",()=>{
    const steps=guidedSchoolJourney(program,{
      status:"in_progress",
      requirements:[{status:"blocked",blocking:true,title:"Teacher qualifications"}],
    });
    expect(steps.map(x=>x.state)).toEqual([
      "needs_attention","needs_attention","needs_attention","needs_attention","needs_attention","review",
    ]);
    expect(steps[0]?.evidence).toContain("1 recorded blocking");
    expect(steps[1]?.href).toContain("/operations/launch/");
    expect(steps.at(-1)?.evidence).toContain("school-opening authority");
  });
  it("preserves partial progress without falsely claiming notifications or browser acceptance",()=>{
    const steps=guidedSchoolJourney({
      ...program,status:"active",
      counts:{...program.counts,sections:1,publishedSections:1,staffedSections:1,
        adoptedCurriculumPacks:1,activeProgramStudents:1,placedStudents:1,
        publishedAssessments:1,gradedWork:1,unresolvedGuardianResponses:1},
    },null);
    expect(steps.map(x=>x.state)).toEqual([
      "review","review","recorded","recorded","review","review",
    ]);
    expect(steps[4]?.evidence).toContain("1 outstanding guardian");
    expect(steps[5]?.state).toBe("review");
  });
  it("flags active students without a valid class placement",()=>{
    const steps=guidedSchoolJourney({...program,status:"active",counts:{
      ...program.counts,applications:2,activeProgramStudents:2,placedStudents:1,
    }},null);
    expect(steps[2]?.evidence).toContain("1 awaiting classes");
    expect(steps[2]?.state).toBe("needs_attention");
  });
  it("requires all existing sections staffed before claiming instructional coverage",()=>{
    const steps=guidedSchoolJourney({...program,counts:{
      ...program.counts,sections:2,publishedSections:2,staffedSections:1,
    }},null);
    expect(steps[1]?.state).toBe("needs_attention");
  });
});

describe("school action priorities",()=>{
  const now=new Date("2026-10-22T09:00:00Z").getTime();
  const action=(id:string,overrides:Partial<{
    priority:"critical"|"high"|"normal";
    status:string;dueAt:string|null;ownerPersonId:string|null;createdAt:string
  }>={})=>({id,priority:"normal" as const,status:"open",dueAt:null,
    ownerPersonId:"staff",createdAt:"2026-10-20T00:00:00Z",...overrides});
  it("prioritizes actual urgency, overdue deadlines then missing ownership",()=>{
    const items=[
      action("normal-later"),
      action("urgent-later",{priority:"critical"}),
      action("overdue",{dueAt:"2026-10-20T00:00:00Z"}),
      action("unassigned",{ownerPersonId:null}),
      action("high-later",{priority:"high"}),
    ];
    expect(prioritizeSchoolActions(items,now).map(x=>x.id))
      .toEqual(["urgent-later","high-later","overdue","unassigned","normal-later"]);
    expect(items[0]?.id).toBe("normal-later");
    expect(schoolActionBacklog(items,now)).toEqual({
      overdue:1,unassigned:1,waiting:0,
    });
  });
  it("does not count future deadlines as overdue and counts waiting explicitly",()=>{
    const list=[action("future",{dueAt:"2026-10-30T00:00:00Z",status:"waiting"})];
    expect(schoolActionBacklog(list,now)).toEqual({overdue:0,unassigned:0,waiting:1});
  });
});

