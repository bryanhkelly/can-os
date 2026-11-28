import { and, asc, eq } from "drizzle-orm";
import type { CommandContext } from "@/domain/command-context";
import { db } from "@/db/client";
import {
  courseLessons, courseUnits, learnerLessonProgress, canonicalClassOutcomes, canonicalClassAwards,
} from "@/db/canonical-v301";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
import { canonicalLessonVideoResources } from "@/domain/canonical-lesson-video-resources";
import { deriveNativeClassResume } from "@/domain/native-class-resume";


type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Canonical ordered lesson projection, shared by full workspace and resume. */
export async function readLearnerLessons(tx:Tx,courseVersionId:string,courseAttemptId:string){
      const lessons=await tx.select({
        unitId:courseUnits.id,unitTitle:courseUnits.title,
        unitOrder:courseUnits.sequenceNo,
        lessonId:courseLessons.id,lessonTitle:courseLessons.title,
        lessonOrder:courseLessons.lessonOrder,
        content:courseLessons.content,
        progressStatus:learnerLessonProgress.status,
        observedAt:learnerLessonProgress.observedAt,
      }).from(courseLessons)
        .innerJoin(courseUnits,and(
          eq(courseUnits.id,courseLessons.courseUnitId),
          eq(courseUnits.courseVersionId,courseVersionId),
        ))
        .leftJoin(learnerLessonProgress,and(
          eq(learnerLessonProgress.courseAttemptId,courseAttemptId),
          eq(learnerLessonProgress.lessonId,courseLessons.id),
        ))
        .where(eq(courseLessons.courseVersionId,courseVersionId))
        .orderBy(asc(courseUnits.sequenceNo),asc(courseLessons.lessonOrder),asc(courseLessons.id))
        .limit(500);
      return lessons.map(lesson=>{
        const content=lesson.content&&typeof lesson.content==="object" &&
          !Array.isArray(lesson.content)
          ?lesson.content as Record<string,unknown>:{};
        const videoResources=canonicalLessonVideoResources(content,{includeSupplementalCandidates:false});
        return {
          unitId:lesson.unitId,unitTitle:lesson.unitTitle,unitOrder:lesson.unitOrder,
          lessonId:lesson.lessonId,lessonTitle:lesson.lessonTitle,lessonOrder:lesson.lessonOrder,
          progressStatus:lesson.progressStatus,observedAt:lesson.observedAt,
          lessonBody:typeof content.body==="string"?content.body:"",
          videoResources,
        };
      });
}

export async function readNativeClassResume(actor:CommandContext,classEnrollmentId:string){
    return db.transaction(async tx=>{
      const {cls,access}=await authorizeNativeLearnerClass(tx,actor,classEnrollmentId,"active_read");
      const lessons=await readLearnerLessons(tx,access.courseVersionId,access.courseAttemptId);
      return deriveNativeClassResume(cls.id,cls.title,lessons);
    });
}

/** Shared authorized history workspace. Exact enrollment and attempt are resolved server-side. */
export async function readNativeClassLearning(actor:CommandContext,classEnrollmentId:string){
    return db.transaction(async tx=>{
      const {enrollment,cls:instance,access}=await authorizeNativeLearnerClass(tx,actor,classEnrollmentId,"history_read");
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
}
