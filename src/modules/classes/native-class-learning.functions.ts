import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassOutcomes, canonicalClassAwards,
} from "@/db/canonical-v301";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";

import { completeNativeClassLesson, lessonCompletionInput } from "./native-class-learner-write.server";

const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

import { readLearnerLessons, readNativeClassResume } from "./native-class-learning-read.server";

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
    return db.transaction(async tx=>{
      const {enrollment,cls:instance,access}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"history_read");
      const scope={
        classId:instance.id,classEnrollmentId:enrollment.id,
        courseAttemptId:access.courseAttemptId,courseVersionId:access.courseVersionId,
      };
      const safeLessons=await readLearnerLessons(tx,scope.courseVersionId,scope.courseAttemptId);
      const outcomes=await tx.select({
        id:canonicalClassOutcomes.id,kind:canonicalClassOutcomes.outcomeKind,
        result:canonicalClassOutcomes.resultCode,
        recordedAt:canonicalClassOutcomes.recordedAt,
      }).from(canonicalClassOutcomes)
        .where(eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id))
        .orderBy(asc(canonicalClassOutcomes.recordedAt)).limit(100);
      const awards=await tx.select({
        kind:canonicalClassAwards.awardKind,issuedAt:canonicalClassAwards.issuedAt,
        revokedAt:canonicalClassAwards.revokedAt,
      }).from(canonicalClassAwards)
        .innerJoin(canonicalClassOutcomes,eq(canonicalClassOutcomes.id,canonicalClassAwards.classOutcomeId))
        .where(eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id))
        .orderBy(asc(canonicalClassAwards.issuedAt)).limit(100);
      return {
        classId:scope.classId,classEnrollmentId:scope.classEnrollmentId,
        courseAttemptId:scope.courseAttemptId,classTitle:instance.title,
        courseVersionId:scope.courseVersionId,
        enrollmentStatus:enrollment.status,creditMode:enrollment.creditMode,
        lessons:safeLessons,outcomes,awards,
      };
    });
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
