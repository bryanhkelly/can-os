import { z } from "zod";

export const teacherEducationEntrySchema = z.object({
  institution: z.string().trim().min(1).max(160),
  degree: z.string().trim().min(1).max(120),
  fieldOfStudy: z.string().trim().max(120).nullable(),
  graduationYear: z.number().int().min(1900).max(2100).nullable(),
});

export const teacherProfessionalProfileSchema = z.object({
  education: z.array(teacherEducationEntrySchema).max(10),
  teachingExperienceYears: z.number().int().min(0).max(60).nullable(),
  specialties: z.array(z.string().trim().min(1).max(100)).max(12),
}).superRefine((profile, context) => {
  const specialties = profile.specialties.map(value => value.toLowerCase());
  if (new Set(specialties).size !== specialties.length) {
    context.addIssue({
      code: "custom",
      path: ["specialties"],
      message: "Specialty areas must be unique.",
    });
  }
});

export type TeacherProfessionalProfile = z.infer<typeof teacherProfessionalProfileSchema>;
