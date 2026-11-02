import { z } from "zod";

/** Source-neutral intake contract. No publishing, approval or adoption is implied. */
export const curriculumIntakeSchema = z.object({
  schemaVersion: z.literal(1),
  publisherOrganizationId: z.string().uuid(),
  source: z.object({
    sourceId: z.string().min(1),
    sourceType: z.enum(["original", "publisher_upload", "open_educational_resource", "licensed_third_party"]),
    sourceUrl: z.string().url().optional(),
    retrievedAt: z.string().datetime().optional(),
    title: z.string().min(1),
    author: z.string().optional(),
    rightsHolder: z.string().optional(),
    licenseIdentifier: z.string().min(1),
    licenseUrl: z.string().url().optional(),
    attribution: z.string().optional(),
    permissionEvidence: z.string().optional(),
    edition: z.string().optional(),
  }),
  courses: z.array(z.object({
    externalId: z.string().min(1),
    code: z.string().min(1),
    title: z.string().min(1),
    subject: z.string().min(1),
    description: z.string().optional(),
    gradeBands: z.array(z.string()).default([]),
    learning: z.unknown(),
  })).min(1),
}).superRefine((input, ctx) => {
  const codes = new Set<string>();
  const externalIds = new Set<string>();
  for (const [i, course] of input.courses.entries()) {
    if (codes.has(course.code)) ctx.addIssue({code:"custom",path:["courses",i,"code"],message:"Duplicate course code"});
    if (externalIds.has(course.externalId)) ctx.addIssue({code:"custom",path:["courses",i,"externalId"],message:"Duplicate external ID"});
    codes.add(course.code);
    externalIds.add(course.externalId);
  }
  if (input.source.sourceType === "open_educational_resource" && !input.source.sourceUrl)
    ctx.addIssue({code:"custom",path:["source","sourceUrl"],message:"OER source URL required"});
  if (input.source.sourceType === "licensed_third_party" && !input.source.permissionEvidence)
    ctx.addIssue({code:"custom",path:["source","permissionEvidence"],message:"Licensed content requires permission evidence"});
});
export type CurriculumIntake = z.infer<typeof curriculumIntakeSchema>;
