import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  createInstructionalTrackDraft,
  createInstructionalTrackDraftSchema,
  instructionalTrackReleaseSchema,
  publishInstructionalTrack,
  reviewInstructionalTrack,
  reviewInstructionalTrackSchema,
  saveInstructionalTrackDraft,
  saveInstructionalTrackDraftSchema,
  submitInstructionalTrack,
  withdrawInstructionalTrack,
  withdrawInstructionalTrackSchema,
} from "./instructional-track-authoring.server";
import {
  completeRecordedLesson,
  completeRecordedLessonSchema,
  listAvailableInstructionalTracks,
  getSelectedInstructionalTrackAssetDownload,
  instructionalTrackAssetDownloadSchema,
  readFormativePracticeHistory,
  readInstructionalTrackSchema,
  readSelectedInstructionalTrack,
  recordFormativePractice,
  recordFormativePracticeSchema,
  selectInstructionalTrack,
  selectInstructionalTrackSchema,
} from "./student-instructional-tracks.server";

function privateNoStore(): void {
  setResponseHeader("Cache-Control", "private, no-store");
}

export const createRecordedInstructionDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => createInstructionalTrackDraftSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return createInstructionalTrackDraft(await getCommandContext(getRequest()), data);
  });

export const saveRecordedInstructionDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => saveInstructionalTrackDraftSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return saveInstructionalTrackDraft(await getCommandContext(getRequest()), data);
  });

export const submitRecordedInstructionDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => instructionalTrackReleaseSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return submitInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const decideRecordedInstructionReview = createServerFn({ method: "POST" })
  .validator((value: unknown) => reviewInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return reviewInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const publishRecordedInstruction = createServerFn({ method: "POST" })
  .validator((value: unknown) => instructionalTrackReleaseSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return publishInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const withdrawRecordedInstruction = createServerFn({ method: "POST" })
  .validator((value: unknown) => withdrawInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return withdrawInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const getStudentRecordedInstructors = createServerFn({ method: "GET" })
  .validator((value: unknown) => readInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return listAvailableInstructionalTracks(await getCommandContext(getRequest()), data);
  });

export const selectRecordedInstructor = createServerFn({ method: "POST" })
  .validator((value: unknown) => selectInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return selectInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const getRecordedLessonInstruction = createServerFn({ method: "GET" })
  .validator((value: unknown) => readInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return readSelectedInstructionalTrack(await getCommandContext(getRequest()), data);
  });

export const getRecordedInstructionAssetDownload = createServerFn({ method: "POST" })
  .validator((value: unknown) => instructionalTrackAssetDownloadSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return getSelectedInstructionalTrackAssetDownload(
      await getCommandContext(getRequest()),
      data,
    );
  });

export const completeRecordedCourseLesson = createServerFn({ method: "POST" })
  .validator((value: unknown) => completeRecordedLessonSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return completeRecordedLesson(await getCommandContext(getRequest()), data);
  });

export const recordRecordedInstructorPractice = createServerFn({ method: "POST" })
  .validator((value: unknown) => recordFormativePracticeSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return recordFormativePractice(await getCommandContext(getRequest()), data);
  });

export const getRecordedInstructorPracticeHistory = createServerFn({ method: "GET" })
  .validator((value: unknown) => readInstructionalTrackSchema.parse(value))
  .handler(async ({ data }) => {
    privateNoStore();
    return readFormativePracticeHistory(await getCommandContext(getRequest()), data);
  });
