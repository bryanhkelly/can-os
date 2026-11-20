import { describe, expect, it } from "vitest";
import {
  academyReferenceMayBeSelected, isSchoolYearAcademyReference,
  newlyRestrictedSiteIntent, noSchoolYearAvailability,
  schoolYearInterestMayBeSelected,
} from "@/domain/site-program-access-v61";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";

function program(code: string, category: string, min = "6", max = "12"):
  BlueprintReferenceCatalogItem {
  return {
    itemId: code, versionId: code + "-v1", code, category,
    kind: "program_model", title: code, summary: "Published planning reference",
    versionNo: 1, status: "reference_only", academicGradeRange: {min,max},
  };
}

const community = [
  program("can.program.after_school","extended"),
  program("can.program.summer_enrichment","extended"),
  program("can.program.saturday_academy","extended"),
  program("can.program.ai_digital_skills","community"),
  program("can.program.custom_training","community"),
  program("can.program.college_career_bridge","extended","9","12"),
];
const schools = [
  program("can.program.middle_school_6_8","core","6","8"),
  program("can.program.high_school_9_12","core","9","12"),
  program("can.program.combined_6_12","core"),
  program("can.program.high_school_extension","extension","9","12"),
  program("can.program.hybrid_academy","alternative"),
  program("can.program.homeschool_cohort","alternative"),
  program("can.program.k8_extension","extension","6","8"),
];

describe("V6.1 general-purpose Site Program selection",()=>{
  it("greys only school-year academic models; grade-range alone never disables enrichment",()=>{
    expect(schools.every(item => isSchoolYearAcademyReference(item))).toBe(true);
    expect(schools.every(item =>
      !academyReferenceMayBeSelected(item,noSchoolYearAvailability))).toBe(true);
    expect(community.every(item => !isSchoolYearAcademyReference(item))).toBe(true);
    expect(community.every(item =>
      academyReferenceMayBeSelected(item,noSchoolYearAvailability))).toBe(true);
    expect(schoolYearInterestMayBeSelected("grades-6-8",noSchoolYearAvailability)).toBe(false);
    expect(schoolYearInterestMayBeSelected("grades-9-12",noSchoolYearAvailability)).toBe(false);
    for(const interest of ["afterschool","summer","adult","senior"]){
      expect(schoolYearInterestMayBeSelected(interest,noSchoolYearAvailability)).toBe(true);
    }
  });

  it("unlocks a selected grade band independently, not a combined academy with partial coverage",()=>{
    const onlyHighSchool={"grades-6-8":false,"grades-9-12":true};
    expect(academyReferenceMayBeSelected(schools[1]!,onlyHighSchool)).toBe(true);
    expect(academyReferenceMayBeSelected(schools[0]!,onlyHighSchool)).toBe(false);
    expect(academyReferenceMayBeSelected(schools[2]!,onlyHighSchool)).toBe(false);
    expect(academyReferenceMayBeSelected(schools[3]!,onlyHighSchool)).toBe(true);
    expect(academyReferenceMayBeSelected(schools[4]!,onlyHighSchool)).toBe(false);
    expect(academyReferenceMayBeSelected(schools[2]!,{
      "grades-6-8":true,"grades-9-12":true,
    })).toBe(true);
  });

  it("rejects only newly chosen unauthorized academy intents, preserving existing stored selections",()=>{
    const existing={
      interestIds:["grades-9-12","senior"] as ("grades-9-12"|"senior")[],
      programCodes:["can.program.high_school_9_12"],
    };
    const selected={
      interestIds:["grades-9-12","senior","summer","grades-6-8"] as
        ("grades-9-12"|"senior"|"summer"|"grades-6-8")[],
      programCodes:["can.program.high_school_9_12",
        "can.program.summer_enrichment","can.program.combined_6_12"],
    };
    expect(newlyRestrictedSiteIntent(selected,existing,
      [...community,...schools],noSchoolYearAvailability)).toEqual([
        "grades-6-8","can.program.combined_6_12",
      ]);
    expect(newlyRestrictedSiteIntent({
      interestIds:["senior","summer"],
      programCodes:["can.program.summer_enrichment","can.program.ai_digital_skills"],
    },{
      interestIds:[], programCodes:[],
    },[...community,...schools],noSchoolYearAvailability)).toEqual([]);
  });

  it("fails closed for malformed school-year grade metadata",()=>{
    expect(academyReferenceMayBeSelected({
      ...schools[2]!,academicGradeRange:null,
    },{"grades-6-8":true,"grades-9-12":true})).toBe(false);
    expect(academyReferenceMayBeSelected({
      ...schools[2]!,academicGradeRange:{min:"9",max:"6"},
    },{"grades-6-8":true,"grades-9-12":true})).toBe(false);
  });
});
