import { describe, expect, it } from "vitest";
import {
  academicMarketingSnapshot, isAcademicMarketingType,
  publishableAcademicProgram, publicAcademicProgram,
} from "@/domain/academic-program-publication";

describe("academic Program marketing approval", () => {
  const site = "00000000-0000-4000-8000-000000000001";
  const org = "00000000-0000-4000-8000-000000000002";
  const base = {
    type: "high_school_extension" as const, status: "draft",
    siteId: site, organizationId: org,
    publicationSiteId: site, siteOrganizationId: org,
  };
  it("permits marketing a draft/launching school-year Program, not an enrichment season", () => {
    expect(isAcademicMarketingType("high_school_extension")).toBe(true);
    expect(isAcademicMarketingType("summer_enrichment")).toBe(false);
    expect(publishableAcademicProgram(base)).toBe(true);
    expect(publishableAcademicProgram({ ...base, status: "launching" })).toBe(true);
    expect(publishableAcademicProgram({ ...base, status: "paused" })).toBe(false);
    expect(publishableAcademicProgram({ ...base, siteId: "another" })).toBe(false);
    expect(publishableAcademicProgram({ ...base, siteOrganizationId: "another" })).toBe(false);
  });
  it("snapshots only canonical grades/delivery with reviewed plain-text copy", () => {
    const program = {
      name: "9th Grade Academy",
      gradeRange: { min: "9", max: "9" },
      deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
    };
    const result = academicMarketingSnapshot(
      program, "A hybrid ninth-grade program with local mentors.",
    );
    expect(result.title).toBe(program.name);
    expect(result.deliveryModel).toEqual({
      onsite: true, asynchronous: true, liveOnline: false, onsiteDaysPerWeek: 2,
    });
    expect(() => academicMarketingSnapshot(program, "<script>Claims</script>")).toThrow();
    expect(() => academicMarketingSnapshot(program, "Short")).toThrow();
    // Neither the church host nor a marketing publisher can invent CAN
    // authority, accreditation, tuition terms or admissions status.
    expect(() => academicMarketingSnapshot(program,
      "Our school is fully accredited and guarantees admission.")).toThrow(/regulated academic/);
    expect(() => academicMarketingSnapshot(program,
      "Tuition is guaranteed at $5,000 for all students.")).toThrow(/regulated academic/);
    expect(() => academicMarketingSnapshot({
      ...program, name: "CAN-approved High School Diploma",
    }, "Local mentors support students in a hybrid schedule.")).toThrow(/regulated academic/);
  });
  it("public projection never asserts readiness or accreditor authority", () => {
    const baseRow = {
      programId: "p", title: "Academy", summary: "A local study cohort",
      type: "church_hosted_academy" as const,
      gradeRange: { min: "9", max: "12" },
      deliveryModel: {
        onsite: true, asynchronous: false, liveOnline: true, onsiteDaysPerWeek: 3,
      },
    };
    const planned = publicAcademicProgram({ ...baseRow, status: "launching" });
    expect(planned.availability).toBe("planned");
    expect(planned).not.toHaveProperty("creditIssuingOrganizationId");
    expect(planned).not.toHaveProperty("accreditationAuthorityOrganizationId");
    const merelyActive = publicAcademicProgram({ ...baseRow, status: "active" });
    expect(merelyActive.availability).toBe("operating");
    expect(merelyActive.applicationOpen).toBe(false);
    expect(publicAcademicProgram({ ...baseRow, status: "launching",
      applicationOpen: true }).applicationOpen).toBe(false);
    expect(publicAcademicProgram({ ...baseRow, status: "active",
      applicationOpen: true }).applicationOpen).toBe(true);
  });
});
