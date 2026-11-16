import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassEnrollments, canonicalClasses,
  courseLessons, courseUnits, learnerLessonProgress,
  canonicalClassOutcomes, canonicalClassAwards,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

/** Native read path. Does not fall back to Section, old registrations or
 * learning activity belonging to another Person. */
export const getNativeClassLearning=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class learning release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(actor.role!=="learner" || !actor.actorPersonId)
      throw new AuthorizationError("verified learner Person");
    assertCapability(actor,"learning.participate");
    return db.transaction(async tx=>{
      const [enrollment]=await tx.select().from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.id,data.classEnrollmentId),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!))).limit(1);
      if(!enrollment || !enrollment.courseAttemptId)
        throw new AuthorizationError("own Class Enrollment and Course Attempt");
      const [instance]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
      if(!instance)throw new AuthorizationError("own Class");
      // Use the same native Course Attempt gate as recorded instructors,
      // playback, practice and other learner services. This also rejects
      // suspended adoption or revoked Site authority, not only wrong Person.
      const access=await authorizeCanonicalCourseAttempt(
        tx,actor,enrollment.courseAttemptId,true,
      );
      if(access.source!=="class"||access.sectionId!==null)
        throw new AuthorizationError("native Class Course Attempt");
      const scope={
        classId:instance.id,classEnrollmentId:enrollment.id,
        courseAttemptId:access.courseAttemptId,courseVersionId:access.courseVersionId,
      };
      const lessons=await tx.select({
        unitId:courseUnits.id,unitTitle:courseUnits.title,
        unitOrder:courseUnits.sequenceNo,
        lessonId:courseLessons.id,lessonTitle:courseLessons.title,
        lessonOrder:courseLessons.lessonOrder,
        progressStatus:learnerLessonProgress.status,
        observedAt:learnerLessonProgress.observedAt,
      }).from(courseLessons)
        .innerJoin(courseUnits,and(
          eq(courseUnits.id,courseLessons.courseUnitId),
          eq(courseUnits.courseVersionId,scope.courseVersionId),
        ))
        .leftJoin(learnerLessonProgress,and(
          eq(learnerLessonProgress.courseAttemptId,scope.courseAttemptId),
          eq(learnerLessonProgress.lessonId,courseLessons.id),
        ))
        .where(eq(courseLessons.courseVersionId,scope.courseVersionId))
        .orderBy(asc(courseUnits.sequenceNo),asc(courseLessons.lessonOrder))
        .limit(500);
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
        courseAttemptId:scope.courseAttemptId,classTitle:instance!.title,
        courseVersionId:scope.courseVersionId,
        enrollmentStatus:enrollment.status,creditMode:enrollment.creditMode,
        lessons,outcomes,awards,
      };
    });
  });
