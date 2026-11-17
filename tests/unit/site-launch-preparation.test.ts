import { describe, expect, it } from "vitest";
import { preparesSchoolYear, siteLaunchPreparation } from "@/domain/site-launch-preparation";

describe("contextual Site Launch preparation",()=>{
  it("does not require school opening for adult, afterschool or summer programs",()=>{
    const programs=[
      {type:"summer_program",status:"active",gradeRange:{min:"6",max:"12"}},
      {type:"after_school_enrichment",status:"active",gradeRange:{min:"6",max:"8"}},
    ];
    expect(siteLaunchPreparation(programs,["adult","afterschool","summer"])).toEqual({
      programRecordsAvailable:true,showAcademicPreparation:false,
      showSchoolOpeningPreparation:false,
    });
  });

  it("offers school academic planning from interests without inventing a school approval",()=>{
    expect(siteLaunchPreparation([],["grades-6-8"])).toEqual({
      programRecordsAvailable:true,showAcademicPreparation:true,
      showSchoolOpeningPreparation:false,
    });
  });

  it("shows opening preparation only for a saved school-year Program in grades 6 to 12",()=>{
    const school={type:"church_hosted_academy",status:"launching",
      gradeRange:{min:"6",max:"12"}};
    expect(preparesSchoolYear(school)).toBe(true);
    expect(siteLaunchPreparation([school],[])).toMatchObject({
      showAcademicPreparation:true,showSchoolOpeningPreparation:true,
    });
    expect(preparesSchoolYear({...school,gradeRange:{min:"K",max:"5"}})).toBe(false);
    expect(preparesSchoolYear({...school,status:"cancelled"})).toBe(false);
  });

  it("never converts unavailable Program records into a ready/no-school conclusion",()=>{
    expect(siteLaunchPreparation(null,[])).toEqual({
      programRecordsAvailable:false,showAcademicPreparation:false,
      showSchoolOpeningPreparation:false,
    });
  });

  it("rejects malformed grade spans and non-school delivery models",()=>{
    expect(preparesSchoolYear({type:"full_school",status:"draft",
      gradeRange:{min:"12",max:"6"}})).toBe(false);
    expect(preparesSchoolYear({type:"summer_enrichment",status:"active",
      gradeRange:{min:"6",max:"12"}})).toBe(false);
  });
});
