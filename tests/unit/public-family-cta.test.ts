import { describe, expect, it } from "vitest";
import { academicFamilyCta } from "@/domain/public-family-cta";
import type { PublicAcademicProgram } from "@/domain/academic-program-publication";

const program: PublicAcademicProgram = {
  programId: "program", title: "CAN Academy", summary: "Approved details",
  typeLabel: "Academy", grades: {min:"K",max:"8"},
  delivery: {onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:5},
  availability: "operating", applicationOpen: true,
};

describe("public academic CTA eligibility", () => {
  it("never advertises unpublished or missing Programs", () => {
    expect(academicFamilyCta({program, marketingPublished:false, intakeEligible:true}).state)
      .toBe("unavailable");
    expect(academicFamilyCta({program:null, marketingPublished:true, intakeEligible:true}).destination)
      .toBeNull();
  });
  it("requires both canonical public admissions authorization and independently verified intake eligibility", () => {
    expect(academicFamilyCta({program,marketingPublished:true}).state)
      .toBe("request_information");
    expect(academicFamilyCta({program:{...program,applicationOpen:false},
      marketingPublished:true,intakeEligible:true}).state).toBe("request_information");
    expect(academicFamilyCta({program,marketingPublished:true,intakeEligible:true}))
      .toMatchObject({state:"apply",destination:"/apply"});
  });
  it("uses inquiry rather than Apply for closed or full admission cycles", () => {
    expect(academicFamilyCta({program,marketingPublished:true,intakeEligible:false,
      unavailableReason:"No seats remain"}))
      .toMatchObject({state:"request_information",destination:"/inquiry",reason:"No seats remain"});
  });
  it("fails closed when contact intake is unavailable too", () => {
    expect(academicFamilyCta({program,marketingPublished:true,
      informationRequestsAvailable:false,intakeEligible:false}))
      .toMatchObject({state:"closed",destination:null});
  });
});
