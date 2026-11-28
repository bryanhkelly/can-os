import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";

import { completeNativeClassLesson, lessonCompletionInput } from "./native-class-learner-write.server";

const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

import { readNativeClassLearning, readNativeClassResume } from "./native-class-learning-read.server";

/** Resume needs only the next eligible lesson and aggregate counts. */
export const getNativeClassLearningResume=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getInstructionalLearnerContext(getRequest());
    return readNativeClassResume(actor,data.classEnrollmentId);
  });

/** Native read path. Does not fall back to Section, old registrations or
 * learning activity belonging to another Person. */
export const getNativeClassLearning=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getInstructionalLearnerContext(getRequest());
    return readNativeClassLearning(actor,data.classEnrollmentId);
  });

/** Explicit lesson milestone. Uses the same canonical Course Attempt and
 * native learner authorization as playback. This is not a grade or credit. */
export const markNativeClassLessonComplete=createServerFn({method:"POST"})
  .validator((raw:unknown)=>lessonCompletionInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getInstructionalLearnerContext(getRequest());
    return completeNativeClassLesson(actor,data);
  });
