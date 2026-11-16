import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassEnrollments, canonicalClasses, learnerCourseAttempts,
  programDeployments, deploymentOfferingAdoptions, offeringVersions, courseVersions,
  courseLessons, courseUnits, learnerLessonProgress,
  canonicalClassOutcomes, canonicalClassAwards,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { authorizeNativeClassAttempt } from "@/domain/native-class-enrollment";
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
      const [attempt]=await tx.select().from(learnerCourseAttempts)
        .where(eq(learnerCourseAttempts.id,enrollment.courseAttemptId)).limit(1);
      const [deployment]=instance?await tx.select().from(programDeployments)
        .where(eq(programDeployments.id,instance.deploymentId)).limit(1):[];
      const [adoption]=instance?await tx.select().from(deploymentOfferingAdoptions)
        .where(and(eq(deploymentOfferingAdoptions.id,instance.adoptionId),
          eq(deploymentOfferingAdoptions.deploymentId,instance.deploymentId),
          eq(deploymentOfferingAdoptions.offeringVersionId,instance.offeringVersionId))).limit(1):[];
      const [course]=instance?await tx.select().from(courseVersions)
        .where(eq(courseVersions.id,instance.courseVersionId)).limit(1):[];
      const [offering]=instance?await tx.select().from(offeringVersions)
        .where(eq(offeringVersions.id,instance.offeringVersionId)).limit(1):[];
      const scope=authorizeNativeClassAttempt({
        actorPersonId:actor.actorPersonId,attempt:attempt??null,enrollment,
        classInstance:instance??null,
        authority:deployment&&adoption&&course&&offering?{
          deploymentState:deployment.status,adoptionState:adoption.approvalStatus,
          adoptionValidFrom:adoption.validFrom,adoptionValidThrough:adoption.validThrough,
          coursePublished:course.lifecycle==="published",offeringPublished:offering.lifecycle==="published",
        }:null,now:new Date(),historicalRead:true,
      });
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
