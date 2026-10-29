import { describe, expect, it } from "vitest";
import {
  assertFamilyApplicationOfferYear,
  assertFamilyApplicationRetry,
  assertVerifiedFamilyStudentReuse,
  familyApplicationSchoolYearId,
  schoolYearMatchesFamilyProgram,
} from "@/domain/family-application-handoff";

const program = {id:"program-1",organizationId:"org-1",siteId:"site-1"};
const year = {
  id:"year-1",organizationId:"org-1",siteId:"site-1",programId:null,status:"active",
};

describe("family application academic-year and source handoff", () => {
  it("preserves the intended academic year through offer issuance", () => {
    const metadata = {schoolYearId:"year-1",siteId:"site-1",source:"published_site"};
    expect(familyApplicationSchoolYearId(metadata)).toBe("year-1");
    expect(() => assertFamilyApplicationOfferYear(metadata,"year-1")).not.toThrow();
    expect(() => assertFamilyApplicationOfferYear(metadata,"year-2"))
      .toThrow("must match the family's application");
  });

  it("accepts only an active year belonging to the same Program and Site", () => {
    expect(schoolYearMatchesFamilyProgram(year,program)).toBe(true);
    expect(schoolYearMatchesFamilyProgram({...year,programId:"program-1"},program)).toBe(true);
    expect(schoolYearMatchesFamilyProgram({...year,siteId:"site-2"},program)).toBe(false);
    expect(schoolYearMatchesFamilyProgram({...year,organizationId:"org-2"},program)).toBe(false);
    expect(schoolYearMatchesFamilyProgram({...year,programId:"program-2"},program)).toBe(false);
    expect(schoolYearMatchesFamilyProgram({...year,status:"closed"},program)).toBe(false);
  });

  it("rejects idempotency retries that change student, year or public source", () => {
    const application = {
      studentProfileId:"student-1",
      metadata:{schoolYearId:"year-1",publicFamilyStartRequestId:"start-1"},
    };
    expect(() => assertFamilyApplicationRetry({application,studentProfileId:"student-1",
      schoolYearId:"year-1",familyStartRequestId:"start-1"})).not.toThrow();
    expect(() => assertFamilyApplicationRetry({application,studentProfileId:"student-2",
      schoolYearId:"year-1",familyStartRequestId:"start-1"})).toThrow("another student");
    expect(() => assertFamilyApplicationRetry({application,studentProfileId:"student-1",
      schoolYearId:"year-2",familyStartRequestId:"start-1"})).toThrow("another school year");
    expect(() => assertFamilyApplicationRetry({application,studentProfileId:"student-1",
      schoolYearId:"year-1",familyStartRequestId:"start-2"})).toThrow("another family start");
  });
});

describe("verified existing-student reuse", () => {
  const relationship = {verification:"verified",canManageEnrollment:true};
  it("reuses a Person only with a verified managing relationship and shared Household", () => {
    expect(() => assertVerifiedFamilyStudentReuse({relationship,
      adultHouseholdMember:true,studentHouseholdMember:true})).not.toThrow();
  });

  it.each([
    [{...relationship,verification:"pending"},true,true],
    [{...relationship,canManageEnrollment:false},true,true],
    [relationship,false,true],
    [relationship,true,false],
    [null,true,true],
  ])("rejects unverified or unrelated reuse %#", (relation,adult,student) => {
    expect(() => assertVerifiedFamilyStudentReuse({relationship:relation,
      adultHouseholdMember:adult,studentHouseholdMember:student})).toThrow();
  });
});
