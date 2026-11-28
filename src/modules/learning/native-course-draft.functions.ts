import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getNativeCourseDraftLessonsService, saveNativeCourseLessonDraftService, getNativeCourseReleaseReadinessService, createNativeCourseAssignmentDraftService, getNativeCourseAssignmentDraftsService } from "./native-course-draft.server";

import { draftCourseInput, draftLessonInput, assignmentInput, draftAssignmentsInput, draftLessonListInput } from "./native-course-draft.inputs";
const noStore=()=>setResponseHeader("Cache-Control","private, no-store");
// All input validation and publisher authorization are shared with REST.
export const getNativeCourseDraftLessons=createServerFn({method:"GET"})
  .validator((raw:unknown)=>draftLessonListInput.parse(raw))
  .handler(async({data})=>{noStore();return getNativeCourseDraftLessonsService(getRequest(),data);});

export const saveNativeCourseLessonDraft=createServerFn({method:"POST"})
  .validator((raw:unknown)=>draftLessonInput.parse(raw))
  .handler(async({data})=>{noStore();return saveNativeCourseLessonDraftService(getRequest(),data);});

export const getNativeCourseReleaseReadiness=createServerFn({method:"GET"})
  .validator((raw:unknown)=>draftCourseInput.parse(raw))
  .handler(async({data})=>{noStore();return getNativeCourseReleaseReadinessService(getRequest(),data);});

export const createNativeCourseAssignmentDraft=createServerFn({method:"POST"})
  .validator((raw:unknown)=>assignmentInput.parse(raw))
  .handler(async({data})=>{noStore();return createNativeCourseAssignmentDraftService(getRequest(),data);});

export const getNativeCourseAssignmentDrafts=createServerFn({method:"GET"})
  .validator((raw:unknown)=>draftAssignmentsInput.parse(raw))
  .handler(async({data})=>{noStore();return getNativeCourseAssignmentDraftsService(getRequest(),data);});
