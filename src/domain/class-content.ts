import { z } from "zod";
import { yearlongCourseBlueprintSchema } from "./yearlong-course-blueprint";

const key = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const httpsUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Resources require an HTTPS URL without embedded credentials");
const resource = z.object({
  id: key, title: z.string().min(1).max(200),
  url: httpsUrl.optional(), documentId: z.string().uuid().optional(),
}).refine(value => Boolean(value.url) !== Boolean(value.documentId), "A resource requires exactly one URL or document");
const activity = z.object({
  id:key,
  kind:z.enum(["launch","instruction","worked_example","guided_practice",
    "independent_practice","exit_ticket","reflection","self_check"]),
  title:z.string().min(2).max(200),
  instructions:z.string().trim().min(5).max(30_000),
  estimatedMinutes:z.number().int().min(1).max(180).optional(),
  evidence:z.enum(["practice","formative","teacher_review"]).optional(),
}).strict();
const lesson = z.object({
  id: key, title: z.string().min(1).max(200), body: z.string().max(100_000),
  resources: z.array(resource).max(100).default([]),
  // Structured activities complement legacy lesson text. They are visible to
  // enrolled learners, not a place to store teacher answer keys.
  learningTargets:z.array(z.string().trim().min(5).max(300)).max(12).optional(),
  standards:z.array(z.string().min(3).max(40)).max(20).optional(),
  estimatedMinutes:z.number().int().min(1).max(180).optional(),
  activities:z.array(activity).max(20).optional(),
});
export const classContentSchema = z.object({
  version: z.literal(1),
  syllabus: z.string().max(100_000).default(""),
  blueprint: yearlongCourseBlueprintSchema.optional(),
  modules: z.array(z.object({
    id: key, title: z.string().min(1).max(200), lessons: z.array(lesson).max(200),
  })).max(100).default([]),
  resources: z.array(resource).max(500).default([]),
}).superRefine((value, context) => {
  for (const [label, ids] of [
    ["module", value.modules.map(item => item.id)],
    ["lesson", value.modules.flatMap(item => item.lessons.map(lesson => lesson.id))],
    ["resource", [...value.resources, ...value.modules.flatMap(item => item.lessons.flatMap(lesson => lesson.resources))].map(item => item.id)],
    ["activity", value.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.activities ?? [])).map(item => item.id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate ${label} ID` });
  }
});
export type ClassContent = z.infer<typeof classContentSchema>;

export function readClassContent(curriculum: Record<string, unknown>): ClassContent | null {
  if (curriculum.learning === undefined) return null;
  const result = classContentSchema.safeParse(curriculum.learning);
  if (!result.success) throw new Error("Published class content is invalid. Ask your school to correct the course version.");
  return result.data;
}

export function classResources(content: ClassContent) {
  return [...content.resources, ...content.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.resources))];
}

export function validateAnnotationRange(text: string, start: number, end: number, quote: string) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start ||
      end > text.length || text.slice(start, end) !== quote) {
    throw new Error("The annotation must match the selected text on this submission attempt.");
  }
}
