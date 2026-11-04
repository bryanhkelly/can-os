import { describe, expect, it } from "vitest";
import { teacherProfessionalProfileSchema } from "@/domain/teacher-professional-profile";

describe("teacher professional profile validation", () => {
  it("allows an optional empty profile and self-reported education details", () => {
    expect(teacherProfessionalProfileSchema.parse({
      education: [{
        institution: "North College",
        degree: "M.Ed.",
        fieldOfStudy: "Mathematics Education",
        graduationYear: 2018,
      }],
      teachingExperienceYears: 12,
      specialties: ["Mathematics", "Curriculum design"],
    })).toEqual({
      education: [{
        institution: "North College",
        degree: "M.Ed.",
        fieldOfStudy: "Mathematics Education",
        graduationYear: 2018,
      }],
      teachingExperienceYears: 12,
      specialties: ["Mathematics", "Curriculum design"],
    });
    expect(teacherProfessionalProfileSchema.parse({
      education: [],
      teachingExperienceYears: null,
      specialties: [],
    })).toEqual({ education: [], teachingExperienceYears: null, specialties: [] });
  });

  it("rejects out-of-range experience, incomplete education, and duplicate specialties", () => {
    expect(teacherProfessionalProfileSchema.safeParse({
      education: [],
      teachingExperienceYears: 61,
      specialties: [],
    }).success).toBe(false);
    expect(teacherProfessionalProfileSchema.safeParse({
      education: [{ institution: "", degree: "", fieldOfStudy: null, graduationYear: null }],
      teachingExperienceYears: null,
      specialties: [],
    }).success).toBe(false);
    expect(teacherProfessionalProfileSchema.safeParse({
      education: [],
      teachingExperienceYears: null,
      specialties: ["Literacy", "literacy"],
    }).success).toBe(false);
  });
});
