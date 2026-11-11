import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { createInstructionalTrackDraft, createTrackDraftSchema, publishInstructionalTrack, readInstructionalTrackDraft, readInstructionalTrackCatalog,
  reviewInstructionalTrack, saveInstructionalTrackDraft, saveTrackDraftSchema, submitInstructionalTrack,
  trackReleaseSchema, trackReviewSchema, trackWithdrawalSchema, withdrawInstructionalTrack } from "./instructional-track-authoring.server";
import { getSelectedLessonInstruction, lessonTrackReadSchema, listStudentInstructionalTracks, practiceProgressSchema,
  readStudentPracticeHistory, recordStudentPracticeProgress, selectStudentInstructionalTrack, studentTrackReadSchema,
  studentTrackSelectSchema } from "./student-instructional-tracks.server";

const creator = () => requireActor(["academic_content_creator"], "instructional_track.author");
const reviewer = (capability: "instructional_track.review" | "instructional_track.publish" | "instructional_track.withdraw") =>
  requireActor(["academic_content_reviewer"], capability);
async function learner() {
  const actor = await requireActor(["student", "guardian"]);
  if (!actor.capabilities.has(actor.role === "guardian" ? "student:related-read" : "student:read")) throw new Error("Student academic read capability required.");
  return actor;
}
const privateResponse = () => setResponseHeader("Cache-Control", "private, no-store");

export const getRecordedInstructionCatalog = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ programId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => { privateResponse(); return readInstructionalTrackCatalog(await requireActor(["academic_content_creator", "academic_content_reviewer"]), data); });

export const createRecordedInstructionDraft = createServerFn({ method: "POST" }).inputValidator((value: unknown) => createTrackDraftSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return createInstructionalTrackDraft(await creator(), data); });
export const getRecordedInstructionDraft = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ programId: z.string().uuid(), versionId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => { privateResponse(); return readInstructionalTrackDraft(await requireActor(["academic_content_creator", "academic_content_reviewer"]), data); });
export const saveRecordedInstructionDraft = createServerFn({ method: "POST" }).inputValidator((value: unknown) => saveTrackDraftSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return saveInstructionalTrackDraft(await creator(), data); });
export const submitRecordedInstructionDraft = createServerFn({ method: "POST" }).inputValidator((value: unknown) => trackReleaseSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return submitInstructionalTrack(await creator(), data); });
export const decideRecordedInstructionReview = createServerFn({ method: "POST" }).inputValidator((value: unknown) => trackReviewSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return reviewInstructionalTrack(await reviewer("instructional_track.review"), data); });
export const publishRecordedInstruction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => trackReleaseSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return publishInstructionalTrack(await reviewer("instructional_track.publish"), data); });
export const withdrawRecordedInstruction = createServerFn({ method: "POST" }).inputValidator((value: unknown) => trackWithdrawalSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return withdrawInstructionalTrack(await reviewer("instructional_track.withdraw"), data); });

export const getStudentRecordedInstructors = createServerFn({ method: "GET" }).inputValidator((value: unknown) => studentTrackReadSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return listStudentInstructionalTracks(await learner(), data); });
export const selectRecordedInstructor = createServerFn({ method: "POST" }).inputValidator((value: unknown) => studentTrackSelectSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return selectStudentInstructionalTrack(await learner(), data); });
export const getRecordedLessonInstruction = createServerFn({ method: "GET" }).inputValidator((value: unknown) => lessonTrackReadSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return getSelectedLessonInstruction(await learner(), data); });
export const recordRecordedInstructorPractice = createServerFn({ method: "POST" }).inputValidator((value: unknown) => practiceProgressSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return recordStudentPracticeProgress(await requireActor(["student"], "student:read"), data); });
export const getRecordedInstructorPracticeHistory = createServerFn({ method: "GET" }).inputValidator((value: unknown) => studentTrackReadSchema.parse(value))
  .handler(async ({ data }) => { privateResponse(); return readStudentPracticeHistory(await learner(), data); });
