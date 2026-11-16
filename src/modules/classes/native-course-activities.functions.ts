import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClassActivityAnswers, canonicalClassActivityPins,
  canonicalClassActivitySubmissions, canonicalClassEnrollments,
  canonicalClasses, canonicalClassOutcomes,
  canonicalCourseActivitySets, canonicalCourseActivityAnswerKeys,
  canonicalOfferingCourses, courseVersions, courses, offeringVersions,
  offerings, learnerLessonProgress, courseLessons, auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import {
  courseActivityPublicationSchema, feedbackSubmissionSchema,
  nativeClassCompletionReadiness, publicNativeQuizQuestions,
  quizSubmissionSchema, scoreNativeClassQuiz, validateNativeClassFeedback,
  type QuizPrompt,
} from "@/domain/native-course-activities";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const self=z.object({classEnrollmentId:uuid}).strict();
const submission=self.extend({
  activitySetId:uuid,requestId:uuid,
  kind:z.enum(["quiz","feedback"]),
  quizAnswers:quizSubmissionSchema.optional(),
  feedbackAnswers:feedbackSubmissionSchema.optional(),
  feedbackConsentAccepted:z.boolean().optional(),
}).strict();
const completion=self.extend({requestId:uuid}).strict();

function privateResult(){
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
    throw new AuthorizationError("native Class release not activated");
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function learnerContext(){
  const actor=await getCanonicalCommandContext(getRequest());
  if(actor.role!=="learner"||!actor.actorPersonId)
    throw new AuthorizationError("current verified Class learner");
  assertCapability(actor,"learning.participate");
  return actor as CommandContext & {actorPersonId:string};
}
async function ownClassEnrollment(tx:Tx,actor:CommandContext & {actorPersonId:string},
  classEnrollmentId:string,lock=false){
  const query=tx.select().from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id,classEnrollmentId),
      eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId))).limit(1);
  const [enrollment]=lock?await query.for("update"):await query;
  if(!enrollment||!enrollment.courseAttemptId)
    throw new AuthorizationError("own Class Course Attempt");
  const access=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,true);
  if(access.source!=="class" || access.sectionId!==null)
    throw new AuthorizationError("native Course Attempt provenance");
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
  if(!cls||cls.courseVersionId!==access.courseVersionId)
    throw new AuthorizationError("own Class and published Course");
  return {enrollment,cls,access};
}
async function pinnedActivitySet(tx:Tx,classEnrollmentId:string,courseVersionId:string){
  const [pin]=await tx.select().from(canonicalClassActivityPins)
    .where(eq(canonicalClassActivityPins.classEnrollmentId,classEnrollmentId)).limit(1);
  const [set]=pin?await tx.select().from(canonicalCourseActivitySets)
    .where(eq(canonicalCourseActivitySets.id,pin.activitySetId)).limit(1):
    await tx.select().from(canonicalCourseActivitySets)
      .where(and(eq(canonicalCourseActivitySets.courseVersionId,courseVersionId),
        eq(canonicalCourseActivitySets.state,"published"))).limit(1);
  if(set&&set.courseVersionId!==courseVersionId)
    throw new AuthorizationError("Course activity policy does not belong to this Course");
  return {set:set??null,pin:pin??null};
}
async function activitySubmissions(tx:Tx,enrollmentId:string,activitySetId:string){
  const rows=await tx.select().from(canonicalClassActivitySubmissions)
    .where(and(eq(canonicalClassActivitySubmissions.classEnrollmentId,enrollmentId),
      eq(canonicalClassActivitySubmissions.activitySetId,activitySetId)));
  const quizzes=rows.filter(row=>row.kind==="quiz")
    .sort((a,b)=>a.attemptNo-b.attemptNo);
  return {
    quiz:quizzes.find(row=>row.quizPassed)??quizzes.at(-1)??null,
    quizAttempts:quizzes.length,
    quizPassed:quizzes.some(row=>row.quizPassed===true),
    feedback:rows.find(row=>row.kind==="feedback")??null,
  };
}
async function completionReadiness(tx:Tx,enrollmentId:string,courseAttemptId:string,
  courseVersionId:string,set:typeof canonicalCourseActivitySets.$inferSelect){
  const submissions=await activitySubmissions(tx,enrollmentId,set.id);
  const lessons=await tx.select({id:courseLessons.id}).from(courseLessons)
    .where(eq(courseLessons.courseVersionId,courseVersionId)).limit(501);
  if(lessons.length>500)throw new AuthorizationError("Course lesson completion verification requires pagination");
  const progress=await tx.select({
    lessonId:learnerLessonProgress.lessonId,status:learnerLessonProgress.status,
  }).from(learnerLessonProgress)
    .where(eq(learnerLessonProgress.courseAttemptId,courseAttemptId)).limit(501);
  if(progress.length>500)throw new AuthorizationError("Course lesson evidence requires pagination");
  const completed=new Set(progress.filter(row=>row.status==="completed"||row.status==="waived")
    .map(row=>row.lessonId));
  const completedLessons=lessons.filter(lesson=>completed.has(lesson.id)).length;
  const readiness=nativeClassCompletionReadiness({
    quizPassed:submissions.quizPassed,
    feedbackSubmitted:!!submissions.feedback,
    feedbackRequired:set.feedbackRequired,
    requireAllLessons:set.requireAllLessons,
    completedLessons,totalLessons:lessons.length,
  });
  return {submissions,readiness};
}

/** Provider publisher only. A local hosting Site cannot silently change
 * centrally governed quiz correct answers for other Class deployments.
 */
function assertPublisherActor(actor:CommandContext){
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??"")||
     actor.scope.organizationIds?.length!==1||actor.scope.siteIds?.length!==1)
    throw new AuthorizationError("one current publisher organization and Site");
  assertCapability(actor,"class.manage");
  return {actor,organizationId:actor.scope.organizationIds[0]!};
}
async function publisherOwnsCourse(tx:Tx,organizationId:string,courseVersionId:string){
  const [owned]=await tx.select({id:courseVersions.id}).from(courseVersions)
    .innerJoin(canonicalOfferingCourses,
      eq(canonicalOfferingCourses.courseVersionId,courseVersions.id))
    .innerJoin(offeringVersions,
      eq(offeringVersions.id,canonicalOfferingCourses.offeringVersionId))
    .innerJoin(offerings,and(
      eq(offerings.id,offeringVersions.offeringId),
      eq(offerings.publisherOrganizationId,organizationId),
      eq(offerings.status,"active")))
    .where(and(eq(courseVersions.id,courseVersionId),
      eq(courseVersions.lifecycle,"published"),
      isNotNull(courseVersions.publishedAt),
      eq(offeringVersions.lifecycle,"published"),
      isNotNull(offeringVersions.publishedAt))).limit(1);
  if(!owned)throw new AuthorizationError("publisher-owned published Course version");
}
export const getPublisherNativeCourseActivityOptions=createServerFn({method:"GET"})
  .handler(async()=>{
    privateResult();
    const actor=await getCanonicalCommandContext(getRequest());
    const {organizationId}=assertPublisherActor(actor);
    const rows=await db.select({
      courseVersionId:courseVersions.id,title:courses.title,
    }).from(courseVersions)
      .innerJoin(courses,eq(courses.id,courseVersions.courseId))
      .innerJoin(canonicalOfferingCourses,
        eq(canonicalOfferingCourses.courseVersionId,courseVersions.id))
      .innerJoin(offeringVersions,
        eq(offeringVersions.id,canonicalOfferingCourses.offeringVersionId))
      .innerJoin(offerings,and(
        eq(offerings.id,offeringVersions.offeringId),
        eq(offerings.publisherOrganizationId,organizationId),
        eq(offerings.status,"active")))
      .where(and(eq(courseVersions.lifecycle,"published"),
        isNotNull(courseVersions.publishedAt),
        eq(offeringVersions.lifecycle,"published"),
        isNotNull(offeringVersions.publishedAt)))
      .orderBy(asc(courses.title)).limit(201);
    const unique=[...new Map(rows.slice(0,200).map(row=>
      [row.courseVersionId,row] as const)).values()];
    const published=unique.length?await db.select({
      courseVersionId:canonicalCourseActivitySets.courseVersionId,
      versionNo:canonicalCourseActivitySets.versionNo,
      title:canonicalCourseActivitySets.title,
    }).from(canonicalCourseActivitySets)
      .where(and(inArray(canonicalCourseActivitySets.courseVersionId,
        unique.map(row=>row.courseVersionId)),
        eq(canonicalCourseActivitySets.state,"published"))):[];
    const revisions=new Map(published.map(row=>[row.courseVersionId,row]));
    return {courses:unique.map(row=>({...row,
      publishedVersion:revisions.get(row.courseVersionId)?.versionNo??null,
      publishedTitle:revisions.get(row.courseVersionId)?.title??null,
    })),truncated:rows.length>200};
  });

export const publishNativeCourseActivitySet=createServerFn({method:"POST"})
  .validator((raw:unknown)=>courseActivityPublicationSchema.extend({
    replaceCurrentPublished:z.boolean().default(false),
  }).parse(raw))
  .handler(async({data})=>{
    privateResult();
    const actor=await getCanonicalCommandContext(getRequest());
    const {organizationId}=assertPublisherActor(actor);
    return db.transaction(async tx=>{
      // Serialize publisher revisions against a stable Course version row.
      const [course]=await tx.select({id:courseVersions.id}).from(courseVersions)
        .where(eq(courseVersions.id,data.courseVersionId)).for("update").limit(1);
      if(!course)throw new AuthorizationError("published Course");
      await publisherOwnsCourse(tx,organizationId,course.id);
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      const [latest]=await tx.select({
        id:canonicalCourseActivitySets.id,versionNo:canonicalCourseActivitySets.versionNo,
        state:canonicalCourseActivitySets.state,
      }).from(canonicalCourseActivitySets)
        .where(eq(canonicalCourseActivitySets.courseVersionId,course.id))
        .orderBy(desc(canonicalCourseActivitySets.versionNo)).limit(1);
      const now=new Date();
      if(latest?.state==="published"&&!data.replaceCurrentPublished)
        throw new AuthorizationError("existing published Course activity set; explicitly confirm a new version");
      if(latest?.state==="published")await tx.update(canonicalCourseActivitySets)
        .set({state:"closed",closedAt:now})
        .where(eq(canonicalCourseActivitySets.id,latest.id));
      const [published]=await tx.insert(canonicalCourseActivitySets).values({
        courseVersionId:course.id,publisherOrganizationId:organizationId,
        title:data.title,versionNo:(latest?.versionNo??0)+1,
        quizQuestions:publicNativeQuizQuestions(data.quizQuestions),
        feedbackQuestions:data.feedbackQuestions,
        passingFraction:data.passingFraction.toFixed(5),
        maxQuizAttempts:data.maxQuizAttempts,
        requireAllLessons:data.requireAllLessons,
        feedbackRequired:data.feedbackRequired,
        feedbackConsentVersion:data.feedbackConsentVersion,
        feedbackConsentText:data.feedbackConsentText,
        state:"published",publishedAt:now,
        createdByPersonId:actor.actorPersonId!,
      }).returning({id:canonicalCourseActivitySets.id,versionNo:canonicalCourseActivitySets.versionNo});
      if(!published)throw new Error("Course activity version was not published");
      const answerKeys=Object.fromEntries(data.quizQuestions.map(item=>[item.key,item.correctIndex]));
      await tx.insert(canonicalCourseActivityAnswerKeys).values({
        activitySetId:published.id,answerKeys,
      });
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId!,owningOrganizationId:organizationId,
        eventCode:"class.course_activities.published",
        entityKind:"course_activity_set",entityId:published.id,
        payload:{courseVersionId:course.id,versionNo:published.versionNo,
          quizCount:data.quizQuestions.length,feedbackCount:data.feedbackQuestions.length,
          previousVersionId:latest?.id??null},
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId!,eventType:"CourseActivitiesPublished",
        aggregateType:"course_activity_set",aggregateId:published.id,
        payload:{courseVersionId:course.id,versionNo:published.versionNo},
      });
      return {activitySetId:published.id,versionNo:published.versionNo};
    });
  });

/** Safe learner read projection: answer keys and private feedback are NOT
 * selected at all. Person identity, Class and Course authorization is checked
 * for every read, and policy remains pinned to the first response version.
 */
export const getNativeCourseActivitySet=createServerFn({method:"GET"})
  .validator((raw:unknown)=>self.parse(raw))
  .handler(async({data})=>{
    privateResult();
    const actor=await learnerContext();
    return db.transaction(async tx=>{
      const {enrollment,cls}=await ownClassEnrollment(tx,actor,data.classEnrollmentId);
      const {set}=await pinnedActivitySet(tx,enrollment.id,cls.courseVersionId);
      if(!set)return {available:false as const,activitySetId:null,title:null,
        versionNo:null,quizQuestions:[],feedbackQuestions:[],
        feedbackConsentText:null,feedbackRequired:false,
        quizSubmitted:false,quizPassed:false,quizAttempts:0,maxQuizAttempts:0,feedbackSubmitted:false,
        completionRecorded:false,readiness:null};
      const {submissions,readiness}=await completionReadiness(
        tx,enrollment.id,enrollment.courseAttemptId!,cls.courseVersionId,set);
      const [outcome]=await tx.select({id:canonicalClassOutcomes.id})
        .from(canonicalClassOutcomes).where(and(
          eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id),
          eq(canonicalClassOutcomes.outcomeKind,"completion"),
          eq(canonicalClassOutcomes.sourceKind,"course_activity_set"),
          eq(canonicalClassOutcomes.sourceId,set.id),
        )).limit(1);
      return {available:true as const,activitySetId:set.id,title:set.title,
        versionNo:set.versionNo,quizQuestions:set.quizQuestions,
        feedbackQuestions:set.feedbackQuestions,
        feedbackConsentText:set.feedbackConsentText,
        feedbackRequired:set.feedbackRequired,
        quizSubmitted:submissions.quizAttempts>0,quizPassed:submissions.quizPassed,
        quizAttempts:submissions.quizAttempts,maxQuizAttempts:set.maxQuizAttempts,
        feedbackSubmitted:!!submissions.feedback,
        completionRecorded:!!outcome,readiness};
    });
  });

export const submitNativeClassActivity=createServerFn({method:"POST"})
  .validator((raw:unknown)=>submission.parse(raw))
  .handler(async({data})=>{
    privateResult();
    const actor=await learnerContext();
    return db.transaction(async tx=>{
      const {enrollment,cls}=await ownClassEnrollment(tx,actor,data.classEnrollmentId,true);
      if(enrollment.status!=="active")
        throw new AuthorizationError("active Class participant");
      const {set,pin}=await pinnedActivitySet(tx,enrollment.id,cls.courseVersionId);
      if(!set||set.id!==data.activitySetId)
        throw new AuthorizationError("current pinned Course activity version; reload the Class");
      const [sameRequest]=await tx.select({
        id:canonicalClassActivitySubmissions.id,kind:canonicalClassActivitySubmissions.kind,
      }).from(canonicalClassActivitySubmissions).where(and(
        eq(canonicalClassActivitySubmissions.classEnrollmentId,enrollment.id),
        eq(canonicalClassActivitySubmissions.requestId,data.requestId),
      )).limit(1);
      if(sameRequest){
        if(sameRequest.kind!==data.kind)
          throw new AuthorizationError("a submission retry may not change activity kind");
        return {saved:true,alreadySubmitted:true,kind:data.kind};
      }
      const prior=await activitySubmissions(tx,enrollment.id,set.id);
      if(data.kind==="feedback"&&prior.feedback)
        return {saved:true,alreadySubmitted:true,kind:data.kind};
      if(data.kind==="quiz"&&(prior.quizPassed||prior.quizAttempts>=set.maxQuizAttempts))
        throw new AuthorizationError("no more knowledge-check attempts are available");
      const attemptNo=data.kind==="quiz"?prior.quizAttempts+1:1;
      let quizFraction:string|null=null,quizPassed:boolean|null=null;
      let consentVersion:string|null=null,consentHash:string|null=null;
      let consentedAt:Date|null=null;
      let answers:unknown[];
      if(data.kind==="quiz"){
        if(!data.quizAnswers||data.feedbackAnswers||data.feedbackConsentAccepted)
          throw new AuthorizationError("exact knowledge-check answer payload");
        const [keys]=await tx.select().from(canonicalCourseActivityAnswerKeys)
          .where(eq(canonicalCourseActivityAnswerKeys.activitySetId,set.id)).limit(1);
        if(!keys)throw new AuthorizationError("approved private quiz scoring key");
        const questions:QuizPrompt[]=set.quizQuestions.map(question=>({
          ...question,correctIndex:keys.answerKeys[question.key]??-1,
        }));
        const score=scoreNativeClassQuiz(questions,data.quizAnswers);
        quizFraction=score.fraction.toFixed(5);
        quizPassed=score.fraction>=Number(set.passingFraction);
        answers=data.quizAnswers;
      }else{
        if(!data.feedbackAnswers||data.quizAnswers||data.feedbackConsentAccepted!==true)
          throw new AuthorizationError("feedback answers and explicit informed consent");
        answers=validateNativeClassFeedback(set.feedbackQuestions,data.feedbackAnswers);
        consentVersion=set.feedbackConsentVersion;
        consentHash=createHash("sha256").update(set.feedbackConsentVersion)
          .update("\u0000").update(set.feedbackConsentText).digest("hex");
        consentedAt=new Date();
      }
      if(!pin){
        await tx.insert(canonicalClassActivityPins).values({
          classEnrollmentId:enrollment.id,activitySetId:set.id,
        });
      }
      const [saved]=await tx.insert(canonicalClassActivitySubmissions).values({
        classEnrollmentId:enrollment.id,activitySetId:set.id,kind:data.kind,
        attemptNo,requestId:data.requestId,quizFraction,quizPassed,
        feedbackConsentVersion:consentVersion,
        feedbackConsentSha256:consentHash,feedbackConsentedAt:consentedAt,
      }).returning({id:canonicalClassActivitySubmissions.id});
      if(!saved)throw new Error("Individual learning evidence was not saved");
      await tx.insert(canonicalClassActivityAnswers).values({
        submissionId:saved.id,answers,
      });
      const payload={classEnrollmentId:enrollment.id,activitySetId:set.id,
        kind:data.kind,attemptNo,quizPassed,quizFraction,feedbackConsentVersion:consentVersion};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.activity.submitted",entityKind:"class_activity_submission",
        entityId:saved.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,eventType:"ClassActivitySubmitted",
        aggregateType:"class_activity_submission",aggregateId:saved.id,payload,
      });
      return {saved:true,alreadySubmitted:false,kind:data.kind};
    });
  });

/** Learner-initiated evidence verification records a NONCREDIT policy outcome.
 * It does NOT mark academic grades, issue certificates or count video views.
 * The Course and each learner remain independently authorized.
 */
export const recordNativeClassCompletionEvidence=createServerFn({method:"POST"})
  .validator((raw:unknown)=>completion.parse(raw))
  .handler(async({data})=>{
    privateResult();
    const actor=await learnerContext();
    return db.transaction(async tx=>{
      const {enrollment,cls}=await ownClassEnrollment(tx,actor,data.classEnrollmentId,true);
      if(enrollment.status!=="active")throw new AuthorizationError("active Class participant");
      const {set}=await pinnedActivitySet(tx,enrollment.id,cls.courseVersionId);
      if(!set)throw new AuthorizationError("published or pinned Course learning policy");
      const {readiness}=await completionReadiness(tx,enrollment.id,
        enrollment.courseAttemptId!,cls.courseVersionId,set);
      if(!readiness.eligible)
        throw new AuthorizationError("complete the required knowledge check, feedback and verified lesson milestones first");
      const [existing]=await tx.select({id:canonicalClassOutcomes.id})
        .from(canonicalClassOutcomes).where(and(
          eq(canonicalClassOutcomes.classEnrollmentId,enrollment.id),
          eq(canonicalClassOutcomes.outcomeKind,"completion"),
          eq(canonicalClassOutcomes.sourceKind,"course_activity_set"),
          eq(canonicalClassOutcomes.sourceId,set.id),
        )).limit(1);
      if(existing)return {recorded:true,alreadyRecorded:true,outcomeId:existing.id};
      const [outcome]=await tx.insert(canonicalClassOutcomes).values({
        classEnrollmentId:enrollment.id,outcomeKind:"completion",
        resultCode:"noncredit_requirements_met",
        sourceKind:"course_activity_set",sourceId:set.id,
      }).returning({id:canonicalClassOutcomes.id});
      if(!outcome)throw new Error("Completion readiness evidence was not recorded");
      const payload={classEnrollmentId:enrollment.id,courseActivitySetId:set.id,
        quizPassed:readiness.quizPassed,feedbackMet:readiness.feedbackMet,
        lessonsMet:readiness.lessonsMet,
        completedLessons:readiness.completedLessons,totalLessons:readiness.totalLessons,
        requestId:data.requestId};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.completion_evidence.recorded",
        entityKind:"class_outcome",entityId:outcome.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,eventType:"ClassCompletionEvidenceRecorded",
        aggregateType:"class_outcome",aggregateId:outcome.id,payload,
      });
      return {recorded:true,alreadyRecorded:false,outcomeId:outcome.id};
    });
  });
