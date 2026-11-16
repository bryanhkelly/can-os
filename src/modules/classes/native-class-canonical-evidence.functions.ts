import { and, eq, inArray, isNull, gt, lte, or, desc } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassEnrollments, canonicalClasses, canonicalClassOutcomes,
  learnerProfiles, learnerLessonProgress, courseLessons,
  assessmentAccess, assessmentFormAdministrations,
  assessmentExecutionAttempts, assessmentExecutionResults,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";

const input=z.object({classEnrollmentId:z.string().uuid()}).strict();

/**
 * Read-only adapter for native Classes to the EXISTING canonical Course
 * Attempt, assessment and learning evidence tables.
 *
 * This deliberately neither creates a second quiz/result/survey ledger nor
 * assumes a noncredit registration exists for a Class participant.
 * An authorized provider must separately provision any canonical assessment
 * grants and issue governed outcomes. A learner cannot self-award completion.
 */
export const getNativeClassCanonicalEvidence=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!actor.actorPersonId||actor.role!=="learner")
      throw new AuthorizationError("current Class learner");
    return db.transaction(async tx=>{
      const [enrollment]=await tx.select().from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.id,data.classEnrollmentId),
          eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId))).limit(1);
      if(!enrollment?.courseAttemptId)
        throw new AuthorizationError("own Class Course Attempt");
      const access=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,true);
      if(access.source!=="class"||access.sectionId!==null)
        throw new AuthorizationError("native Class participation provenance");
      const [cls]=await tx.select({id:canonicalClasses.id,
        courseVersionId:canonicalClasses.courseVersionId,
      }).from(canonicalClasses)
        .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
      if(!cls||cls.courseVersionId!==access.courseVersionId)
        throw new AuthorizationError("same Course version and Class");
      const lessons=await tx.select({id:courseLessons.id})
        .from(courseLessons).where(eq(courseLessons.courseVersionId,access.courseVersionId))
        .limit(501);
      if(lessons.length>500)throw new AuthorizationError("Course lesson evidence needs pagination");
      const progress=await tx.select({
        lessonId:learnerLessonProgress.lessonId,
        status:learnerLessonProgress.status,
      }).from(learnerLessonProgress)
        .where(eq(learnerLessonProgress.courseAttemptId,access.courseAttemptId))
        .limit(501);
      if(progress.length>500)throw new AuthorizationError("Lesson progress needs pagination");
      const completed=new Set(progress.filter(p=>p.status==="completed"||p.status==="waived")
        .map(p=>p.lessonId));
      const completedLessons=lessons.filter(lesson=>completed.has(lesson.id)).length;

      // Only this Person's existing canonical assessment grants can be read;
      // no questionnaire answers, grading keys, or private survey data leave.
      const [learner]=await tx.select({id:learnerProfiles.id})
        .from(learnerProfiles).where(eq(learnerProfiles.personId,actor.actorPersonId))
        .limit(1);
      const now=new Date();
      const grants=learner?await tx.select({
        id:assessmentAccess.id,
        administrationId:assessmentFormAdministrations.id,
      }).from(assessmentAccess)
        .innerJoin(assessmentFormAdministrations,
          eq(assessmentFormAdministrations.id,assessmentAccess.administrationId))
        .where(and(
          eq(assessmentAccess.learnerId,learner.id),
          eq(assessmentAccess.courseAttemptId,access.courseAttemptId),
          eq(assessmentAccess.accessStatus,"approved"),
          lte(assessmentAccess.validFrom,now),
          or(isNull(assessmentAccess.validThrough),gt(assessmentAccess.validThrough,now)),
          eq(assessmentFormAdministrations.status,"open"),
          eq(assessmentFormAdministrations.courseVersionId,access.courseVersionId),
          eq(assessmentFormAdministrations.deploymentId,access.deploymentId),
          or(isNull(assessmentFormAdministrations.opensAt),lte(assessmentFormAdministrations.opensAt,now)),
          or(isNull(assessmentFormAdministrations.closesAt),gt(assessmentFormAdministrations.closesAt,now)),
        )).limit(101):[];
      if(grants.length>100)throw new AuthorizationError("Assessment grants require pagination");
      const grantIds=grants.map(g=>g.id);
      const attempts=grantIds.length?await tx.select({
        id:assessmentExecutionAttempts.id,
        state:assessmentExecutionAttempts.state,
      }).from(assessmentExecutionAttempts)
        .where(inArray(assessmentExecutionAttempts.accessGrantId,grantIds)).limit(501):[];
      if(attempts.length>500)throw new AuthorizationError("Assessment history needs pagination");
      const attemptIds=attempts.map(a=>a.id);
      const results=attemptIds.length?await tx.select({
        attemptId:assessmentExecutionResults.attemptId,
        resultStatus:assessmentExecutionResults.resultStatus,
        outcome:assessmentExecutionResults.outcome,
        supersedesId:assessmentExecutionResults.supersedesId,
        id:assessmentExecutionResults.id,
      }).from(assessmentExecutionResults)
        .where(inArray(assessmentExecutionResults.attemptId,attemptIds))
        .orderBy(desc(assessmentExecutionResults.resultRevision)).limit(501):[];
      if(results.length>500)throw new AuthorizationError("Assessment results require pagination");
      const superseded=new Set(results.flatMap(row=>row.supersedesId?[row.supersedesId]:[]));
      const valid=results.filter(row=>!superseded.has(row.id)&&
        row.resultStatus==="finalized"&&
        attempts.some(a=>a.id===row.attemptId&&a.state==="finalized"));
      const [completion]=await tx.select({id:canonicalClassOutcomes.id})
        .from(canonicalClassOutcomes)
        .where(and(eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id),
          eq(canonicalClassOutcomes.outcomeKind,"completion"))).limit(1);
      return {
        courseAttemptId:access.courseAttemptId,
        completedLessons,totalLessons:lessons.length,
        currentAssessmentGrants:grants.length,
        finalizedAssessments:valid.length,
        finalizedPassed:valid.filter(row=>row.outcome==="pass").length,
        classCompletionOutcomeRecorded:!!completion,
        note:"Canonical assessment results and Class outcomes are separate from lesson ticks, room playback, attendance and award issuance. Native Class assessment submission requires a separately approved provider integration.",
      };
    });
  });
