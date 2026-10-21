import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { curriculumDraftContent } from "@/domain/curriculum-authoring";
import { classTeacherGuidesSchema } from "@/domain/class-teacher-guides";
import { requireActor } from "@/modules/identity/actors.server";
import { createCurriculumCourse, createCurriculumDraft, publishCurriculumDraft,
  readCurriculumPrograms, readCurriculumStudio, saveCurriculumDraft } from "./curriculum-authoring.server";

const program = z.object({ programId: z.string().uuid() });
const version = program.extend({ versionId: z.string().uuid(), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) });
const actor = () => requireActor(["registrar"], "curriculum.publish");
export const getCurriculumPrograms = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    return readCurriculumPrograms(await actor());
  });
export const getCurriculumStudio = createServerFn({ method: "GET" })
  .validator((value: unknown) => program.strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return readCurriculumStudio(await actor(), data.programId);
  });
export const createAuthoredCourse = createServerFn({ method: "POST" })
  .validator((value: unknown) => program.extend({ requestId: z.string().uuid(),
    code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(2).max(160), subject: z.string().trim().min(2).max(100),
  }).strict().parse(value))
  .handler(async ({ data }) => createCurriculumCourse(await actor(), data));
export const startCurriculumDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => program.extend({ courseId: z.string().uuid(), sourceVersionId: z.string().uuid().optional(),
    requestId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => createCurriculumDraft(await actor(), data));
export const saveAuthoredCurriculum = createServerFn({ method: "POST" })
  .validator((value: unknown) => version.extend({ content: curriculumDraftContent,
    teacherGuides: classTeacherGuidesSchema.optional() }).strict().parse(value))
  .handler(async ({ data }) => saveCurriculumDraft(await actor(), data));
export const publishAuthoredCurriculum = createServerFn({ method: "POST" })
  .validator((value: unknown) => version.extend({ reason: z.string().trim().min(10).max(2000),
    confirmed: z.literal(true) }).strict().parse(value))
  .handler(async ({ data }) => publishCurriculumDraft(await actor(), data));
