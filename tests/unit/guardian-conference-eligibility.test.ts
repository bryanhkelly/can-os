import { describe, expect, it } from "vitest";
import { eligibleGuardianConferenceStudents } from "@/domain/guardian-conference-eligibility";

const programs = [
  { studentPersonId:"child-a", studentProfileId:"profile-a", programId:"program-a", siteId:"site-a" },
  { studentPersonId:"child-b", studentProfileId:"profile-b", programId:"program-b", siteId:"site-b" },
  { studentPersonId:"child-c", studentProfileId:"profile-c", programId:"program-c", siteId:"site-a" },
];
const sections = [
  { studentProfileId:"profile-a", sectionId:"section-a", programId:"program-a", siteId:"site-a" },
  { studentProfileId:"profile-b", sectionId:"section-b", programId:"program-b", siteId:"site-b" },
  { studentProfileId:"profile-c", sectionId:"section-c", programId:"program-c", siteId:"site-a" },
];

describe("guardian conference eligible students", () => {
  it("only offers a school-wide slot to children enrolled at that Site", () => {
    expect(eligibleGuardianConferenceStudents({siteId:"site-a",sectionId:null},programs,sections)).toEqual(["child-a","child-c"]);
    expect(eligibleGuardianConferenceStudents({siteId:"site-b",sectionId:null},programs,sections)).toEqual(["child-b"]);
  });
  it("only offers class-specific slots to children enrolled in the same Program and Section", () => {
    expect(eligibleGuardianConferenceStudents({siteId:"site-a",sectionId:"section-a"},programs,sections)).toEqual(["child-a"]);
    expect(eligibleGuardianConferenceStudents({siteId:"site-a",sectionId:"section-c"},programs,sections)).toEqual(["child-c"]);
    expect(eligibleGuardianConferenceStudents({siteId:"site-b",sectionId:"section-a"},programs,sections)).toEqual([]);
  });
  it("does not treat a Section-only or wrong Program row as eligibility", () => {
    const wrongSection=[{studentProfileId:"profile-a",sectionId:"section-a",programId:"program-other",siteId:"site-a"}];
    expect(eligibleGuardianConferenceStudents({siteId:"site-a",sectionId:"section-a"},programs,wrongSection)).toEqual([]);
    expect(eligibleGuardianConferenceStudents({siteId:"site-a",sectionId:"section-a"},[],sections)).toEqual([]);
  });
});
