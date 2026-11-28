import { and, eq, inArray, desc, sql } from "drizzle-orm";
import {parseCommandInput} from "@/domain/command-input";
import {input} from "./native-class-canonical-evidence.inputs";
import { db } from "@/db/client";
import {
  canonicalClassOutcomes,
  learnerProfiles, learnerLessonProgress, courseLessons,
  assessmentAccess, assessmentFormAdministrations, assessmentVersions, assessmentDefinitions,
  assessmentExecutionAttempts, assessmentExecutionResults,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
import {matchesNativeClassAssessmentPhase} from "@/modules/learning/native-class-assessment-phase.server";
import {getCanonicalClassPublisher} from "./native-class-publisher.server";
import { latestCanonicalAssessmentRevisions } from "@/domain/canonical-assessment-revisions";



/**
 * Read-only adapter for native Classes to the EXISTING canonical Course
 * Attempt, assessment and learning evidence tables.
 *
 * This deliberately neither creates a second quiz/result/survey ledger nor
 * assumes a noncredit registration exists for a Class participant.
 * An authorized provider must separately provision any canonical assessment
 * grants and issue governed outcomes. A learner cannot self-award completion.
 */
export async function getNativeClassCanonicalEvidenceService(request:Request,raw:unknown){
    const data=parseCommandInput(input,raw);
    const actor=await getInstructionalLearnerContext(request);
    if(!actor.actorPersonId||actor.role!=="learner")
      throw new AuthorizationError("current Class learner");
    return db.transaction(async tx=>{
      const {enrollment,cls,access}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"history_read");
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
        .from(learnerProfiles).where(eq(learnerProfiles.personId,actor.actorPersonId!))
        .limit(1);
      const now=new Date();
      const publisherOrganizationId=await getCanonicalClassPublisher(tx,{offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId});
      const grants=learner?await tx.select({
        id:assessmentAccess.id,
        purpose:assessmentDefinitions.purpose,
        accessStatus:assessmentAccess.accessStatus,
        validFrom:assessmentAccess.validFrom,
        validThrough:assessmentAccess.validThrough,
        administrationStatus:assessmentFormAdministrations.status,
        opensAt:assessmentFormAdministrations.opensAt,
        closesAt:assessmentFormAdministrations.closesAt,
      }).from(assessmentAccess)
        .innerJoin(assessmentFormAdministrations,
          eq(assessmentFormAdministrations.id,assessmentAccess.administrationId))
        .innerJoin(assessmentVersions,eq(assessmentVersions.id,assessmentFormAdministrations.assessmentVersionId))
        .innerJoin(assessmentDefinitions,eq(assessmentDefinitions.id,assessmentVersions.assessmentId))
        .where(and(
          eq(assessmentVersions.lifecycle,"published"),
          eq(assessmentVersions.courseVersionId,access.courseVersionId),
          eq(assessmentDefinitions.ownerOrganizationId,publisherOrganizationId),
          eq(assessmentFormAdministrations.administeringOrganizationId,cls.operatingOrganizationId),
          eq(assessmentAccess.learnerId,learner.id),
          eq(assessmentAccess.courseAttemptId,access.courseAttemptId),
          eq(assessmentFormAdministrations.courseVersionId,access.courseVersionId),
          eq(assessmentFormAdministrations.deploymentId,access.deploymentId),
        )).limit(101):[];
      if(grants.length>100)throw new AuthorizationError("Assessment grants require pagination");
      // A closed administration or expired grant is no longer launchable,
      // but its finalized result remains part of the learner's own history.
      const currentGrants=grants.filter(g=>g.accessStatus==="approved"&&
        g.administrationStatus==="open"&&g.validFrom<=now&&
        (!g.validThrough||g.validThrough>now)&&
        (!g.opensAt||g.opensAt<=now)&&(!g.closesAt||g.closesAt>now));
      const finalGrants=grants.filter(g=>matchesNativeClassAssessmentPhase(g.purpose,"final"));
      const baselineGrants=grants.filter(g=>matchesNativeClassAssessmentPhase(g.purpose,"baseline"));
      const finalGrantIds=new Set(finalGrants.map(g=>g.id));
      const baselineGrantIds=new Set(baselineGrants.map(g=>g.id));
      const grantIds=[...finalGrantIds,...baselineGrantIds];
      const attempts=grantIds.length?await tx.select({
        id:assessmentExecutionAttempts.id,
        state:assessmentExecutionAttempts.state,
        grantId:assessmentExecutionAttempts.accessGrantId,
      }).from(assessmentExecutionAttempts)
        .innerJoin(assessmentAccess,and(eq(assessmentExecutionAttempts.accessGrantId,assessmentAccess.id),eq(assessmentExecutionAttempts.learnerId,assessmentAccess.learnerId),eq(assessmentExecutionAttempts.administrationId,assessmentAccess.administrationId)))
        .where(inArray(assessmentExecutionAttempts.accessGrantId,grantIds)).limit(501):[];
      if(attempts.length>500)throw new AuthorizationError("Assessment history needs pagination");
      const attemptIds=attempts.map(a=>a.id);
      const results=attemptIds.length?await tx.select({
        attemptId:assessmentExecutionResults.attemptId,
        resultRevision:assessmentExecutionResults.resultRevision,
        resultStatus:assessmentExecutionResults.resultStatus,
        outcome:assessmentExecutionResults.outcome,
        supersedesId:assessmentExecutionResults.supersedesId,
        id:assessmentExecutionResults.id,
      }).from(assessmentExecutionResults)
        .where(inArray(assessmentExecutionResults.attemptId,attemptIds))
        .orderBy(desc(assessmentExecutionResults.resultRevision)).limit(501):[];
      if(results.length>500)throw new AuthorizationError("Assessment results require pagination");
      const projected=latestCanonicalAssessmentRevisions(results);
      if(projected.ambiguousAttemptIds.length)
        throw new AuthorizationError("ambiguous canonical assessment revisions");
      const valid=projected.current.filter(row=>
        row.resultStatus==="finalized"&&
        attempts.some(a=>a.id===row.attemptId&&a.state==="finalized"));
      const finalAttemptIds=new Set(attempts.filter(a=>finalGrantIds.has(a.grantId)).map(a=>a.id));
      const baselineAttemptIds=new Set(attempts.filter(a=>baselineGrantIds.has(a.grantId)).map(a=>a.id));
      const finalResults=valid.filter(r=>finalAttemptIds.has(r.attemptId));
      const completionRecords=await tx.select({
        id:canonicalClassOutcomes.id,
        resultCode:canonicalClassOutcomes.resultCode,
        sourceKind:canonicalClassOutcomes.sourceKind,
      }).from(canonicalClassOutcomes)
        .where(and(eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id),
          eq(canonicalClassOutcomes.outcomeKind,"completion"))).limit(101);
      if(completionRecords.length>100)
        throw new AuthorizationError("Class completion history needs pagination");
      // WS3-protected lookup is unavailable until the authoritative SQL patch,
      // independent source binding and feature are deployed. Earlier generic
      // Class Outcomes are never promoted to verified completion.
      let classCompletionAuthorityVerified=false;
      {
        const governed=await tx.select({
          id:canonicalClassOutcomes.id,
          resultCode:canonicalClassOutcomes.resultCode,
          supersedesOutcomeId:canonicalClassOutcomes.supersedesOutcomeId,
        }).from(canonicalClassOutcomes)
          .where(and(
            eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id),
            eq(canonicalClassOutcomes.outcomeKind,"completion"),
            eq(canonicalClassOutcomes.sourceKind,"ws3_governed"),
          )).limit(501);
        if(governed.length>500)
          throw new AuthorizationError("Governed completion history needs pagination");
        const superseded=new Set(governed.flatMap(row=>row.supersedesOutcomeId?
          [row.supersedesOutcomeId]:[]));
        const current=governed.filter(row=>!superseded.has(row.id));
        if(governed.length && current.length!==1)
          throw new AuthorizationError("Conflicting governed Class completion");
        if(current.length===1 && current[0]!.resultCode==="completed"){
          const validity=await tx.execute(sql`
            SELECT education_v30.v301_ws3_class_completion_is_current(
              ${current[0]!.id}::uuid) AS valid
          `);
          classCompletionAuthorityVerified=validity.rows[0]?.valid===true;
        }
      }
      return {
        courseAttemptId:access.courseAttemptId,
        completedLessons,totalLessons:lessons.length,
        currentAssessmentGrants:currentGrants.filter(g=>finalGrantIds.has(g.id)).length,
        currentBaselineGrants:currentGrants.filter(g=>baselineGrantIds.has(g.id)).length,
        finalizedBaselineAssessments:valid.filter(r=>baselineAttemptIds.has(r.attemptId)).length,
        finalizedAssessments:finalResults.length,
        finalizedPassed:finalResults.filter(row=>row.outcome==="pass").length,
        classCompletionOutcomeRecorded:completionRecords.length>0,
        classCompletionAuthorityVerified,
        classCompletionEvidenceCount:completionRecords.length,
        note:classCompletionAuthorityVerified
          ?"This Class completion currently meets its independently approved original policy and authoritative evidence. Academic credit, grades and award issuance remain separately governed."
          :"Recorded Class outcome evidence alone is not a verified completion decision until an independently approved participant-pinned policy and authorized decision are current. Finalized assessments, lesson ticks, room playback and attendance cannot issue an academic award.",
      };
    });
}
