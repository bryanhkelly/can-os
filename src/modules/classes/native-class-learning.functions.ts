import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courseLessons, courseUnits, learnerLessonProgress,
  canonicalClassOutcomes, canonicalClassAwards,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";
import { canonicalLessonVideoResources } from "@/domain/canonical-lesson-video-resources";
import { deriveNativeClassResume } from "@/domain/native-class-resume";

const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Canonical ordered lesson projection, shared by full workspace and resume. */
async function readLearnerLessons(tx:Tx,courseVersionId:string,courseAttemptId:string){
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

/** Resume needs only the next eligible lesson and aggregate counts. */
export const getNativeClassLearningResume=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,access}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
      const lessons=await readLearnerLessons(tx,access.courseVersionId,access.courseAttemptId);
      return deriveNativeClassResume(cls.id,cls.title,lessons);
    });
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
  .validator((raw:unknown)=>z.object({
    classEnrollmentId:z.string().uuid(),lessonId:z.string().uuid(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,access}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write");
      const [lesson]=await tx.select({id:courseLessons.id})
        .from(courseLessons).where(and(eq(courseLessons.id,data.lessonId),
          eq(courseLessons.courseVersionId,cls.courseVersionId))).limit(1);
      if(!lesson)throw new AuthorizationError("lesson in this Course");
      const existing=await tx.execute(sql`
        SELECT id,status FROM public.learner_lesson_progress
        WHERE course_attempt_id=${access.courseAttemptId}::uuid
          AND lesson_id=${data.lessonId}::uuid FOR UPDATE
      `);
      const already=existing.rows[0] as {id:string;status:string}|undefined;
      if(already?.status==="completed"||already?.status==="waived")
        return {recorded:true,alreadyCompleted:true};
      if(already){
        await tx.execute(sql`
          UPDATE public.learner_lesson_progress
          SET status='completed',observed_at=now()
          WHERE id=${already.id}::uuid AND status IN ('not_started','in_progress')
        `);
      }else{
        await tx.execute(sql`
          INSERT INTO public.learner_lesson_progress
            (course_attempt_id,course_version_id,lesson_id,status)
          VALUES (${access.courseAttemptId}::uuid,${cls.courseVersionId}::uuid,
            ${data.lessonId}::uuid,'completed')
          ON CONFLICT (course_attempt_id,lesson_id) DO NOTHING
        `);
      }
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.lesson.milestone_completed",entityKind:"course_lesson",
        entityId:data.lessonId,payload:{classId:cls.id,courseAttemptId:access.courseAttemptId,
          masteryOrCredit:false},
      });
      return {recorded:true,alreadyCompleted:false};
    });
  });
