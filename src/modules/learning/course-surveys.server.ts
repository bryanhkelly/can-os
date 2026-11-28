import {DomainError} from "@/domain/errors";
import {parseCommandInput} from "@/domain/command-input";
import { and, asc, eq, inArray, gt, gte, lte, or, isNull, isNotNull, notExists } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { surveyDefinitions, surveyVersions, surveyQuestions,
  surveyQuestionOptions, surveyQuestionBranchRules, surveyCampaigns, surveyInvitations,
  surveyResponses, surveyAnswers, surveyAnswerChoices,
  canonicalClassSurveyCampaigns, canonicalClassEnrollments, canonicalClasses,
  learnerCourseAttempts, noncreditRegistrations, offeringVersions } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import { validateCourseSurveyAnswers, SurveyValidationError, type SurveyQuestion } from "@/domain/course-survey";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { evidenceDocumentVersions } from "@/db/canonical-v301";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";
import type { CanonicalParticipationAccess } from "@/domain/canonical-course-participation";

import {scope,submission,courseInput} from "./course-surveys.inputs";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
function requireLearner(context:CommandContext): asserts context is CommandContext & {actorPersonId:string} {
  if(context.role!=="learner"||!context.actorPersonId)throw new AuthorizationError("canonical learner");
  assertCapability(context,"learning.survey.respond");
}

/** Class survey invitations must target a campaign bound to EXACTLY the
 * active Class of this Person's authorized canonical Course Attempt.
 * Course/Deployment equality alone is insufficient when a learner attends
 * several Classes delivered under the same published Course.
 */
async function classSurveyCampaignIds(tx:Tx,context:CommandContext & {actorPersonId:string},
  access:CanonicalParticipationAccess):Promise<string[]|null>{
  if(access.source!=="class")return null;
  const [row]=await tx.select({classId:canonicalClasses.id})
    .from(learnerCourseAttempts)
    .innerJoin(canonicalClassEnrollments,and(
      eq(canonicalClassEnrollments.id,learnerCourseAttempts.classEnrollmentId),
      eq(canonicalClassEnrollments.courseAttemptId,learnerCourseAttempts.id),
      eq(canonicalClassEnrollments.learnerPersonId,context.actorPersonId),
      inArray(canonicalClassEnrollments.status,["active","completed"])))
    .innerJoin(canonicalClasses,and(
      eq(canonicalClasses.id,canonicalClassEnrollments.classId),
      eq(canonicalClasses.state,"active"),
      eq(canonicalClasses.deploymentId,access.deploymentId),
      eq(canonicalClasses.courseVersionId,access.courseVersionId)))
    .where(eq(learnerCourseAttempts.id,access.courseAttemptId)).limit(1);
  if(!row)throw new AuthorizationError("exact active Class survey participation");
  const links=await tx.select({campaignId:canonicalClassSurveyCampaigns.campaignId})
    .from(canonicalClassSurveyCampaigns)
    .where(eq(canonicalClassSurveyCampaigns.classId,row.classId)).limit(51);
  if(links.length>50)throw new AuthorizationError("Class survey campaigns require pagination");
  return links.map(link=>link.campaignId);
}


/**
 * Return the exact registered noncredit Offering AND operating Organization.
 * A shared Deployment/Offering does not authorize another operator's survey.
 * The Course Attempt, Registration and Person must agree in this transaction.
 */
async function noncreditSurveyScope(tx:Tx,access:CanonicalParticipationAccess):
  Promise<{offeringId:string;operatingOrganizationId:string}|null>{
  if(access.source!=="noncredit")return null;
  if(!access.noncreditRegistrationId)throw new AuthorizationError("registered noncredit learner");
  const [row]=await tx.select({
    offeringId:offeringVersions.offeringId,
    operatingOrganizationId:noncreditRegistrations.registeringOrganizationId,
  }).from(learnerCourseAttempts)
    .innerJoin(noncreditRegistrations,and(
      eq(noncreditRegistrations.id,learnerCourseAttempts.noncreditRegistrationId),
      eq(noncreditRegistrations.deploymentId,learnerCourseAttempts.deploymentId),
      eq(noncreditRegistrations.offeringVersionId,learnerCourseAttempts.offeringVersionId),
      eq(noncreditRegistrations.participantPersonId,access.participantPersonId),
    ))
    .innerJoin(offeringVersions,
      eq(offeringVersions.id,learnerCourseAttempts.offeringVersionId))
    .where(and(
      eq(learnerCourseAttempts.id,access.courseAttemptId),
      eq(noncreditRegistrations.id,access.noncreditRegistrationId),
    )).limit(1);
  if(!row)throw new AuthorizationError("current registered noncredit survey scope");
  return row;
}

/**
 * Identified survey only: person-bound invitations, published versions, and
 * deployment-scoped campaign permissions. Anonymous/confidential surveys,
 * branching, matrix questions, and safeguarding intake require their distinct
 * approved flows. Survey feedback is never an assessment grade.
 */
async function loadCourseSurvey(tx:Tx,context:CommandContext & {actorPersonId:string},data:z.infer<typeof scope>) {
  const access=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId,true);
  if(access.source!=="noncredit"&&access.source!=="class")
    throw new AuthorizationError("active registered Course or Class participant");
  const allowedClassCampaigns=await classSurveyCampaignIds(tx,context,access);
  const noncreditScope=await noncreditSurveyScope(tx,access);
  if(allowedClassCampaigns&&!allowedClassCampaigns.includes(data.campaignId))
    throw new AuthorizationError("survey campaign is not attributed to this Class");
  if(access.source==="noncredit"){
    const [classScoped]=await tx.select({campaignId:canonicalClassSurveyCampaigns.campaignId})
      .from(canonicalClassSurveyCampaigns)
      .where(eq(canonicalClassSurveyCampaigns.campaignId,data.campaignId)).limit(1);
    if(classScoped)throw new AuthorizationError("Class-specific campaign cannot be claimed by noncredit registration");
  }
  const [campaign]=await tx.select().from(surveyCampaigns)
    .where(and(eq(surveyCampaigns.id,data.campaignId),
      eq(surveyCampaigns.deploymentId,access.deploymentId))).limit(1);
  const now=new Date();
  if(!campaign||(noncreditScope!==null&&
    (campaign.offeringId!==noncreditScope.offeringId||
     campaign.operatingOrganizationId!==noncreditScope.operatingOrganizationId))||
    campaign.status!=="active"||campaign.responseMode!=="identified"||
    campaign.startsAt>now||(campaign.endsAt&&campaign.endsAt<=now)||
    !campaign.surveyPermissionEvidenceId)throw new AuthorizationError("active authorized survey campaign");
  const [permission]=await tx.select().from(evidenceDocumentVersions)
    .where(eq(evidenceDocumentVersions.id,campaign.surveyPermissionEvidenceId)).limit(1);
  const today=now.toISOString().slice(0,10);
  if(!permission||!permission.verifiedAt||!permission.verifiedByPersonId||
     permission.verifiedAt>now||
     (permission.validFrom&&permission.validFrom>today)||
     (permission.validThrough&&permission.validThrough<today))
    throw new AuthorizationError("current verified permission for identifiable feedback");
  // Lock the invitation before checking its one-response slot. Concurrent
  // submissions then serialize rather than racing the unique invitation key.
  const [invitation]=await tx.select().from(surveyInvitations)
    .where(and(eq(surveyInvitations.campaignId,campaign.id),
      eq(surveyInvitations.invitedPersonId,context.actorPersonId)))
    .for("update").limit(1);
  if(!invitation||!invitation.sentAt||invitation.sentAt>now||(invitation.dueAt&&invitation.dueAt<=now))
    throw new AuthorizationError("current personal survey invitation");
  const [version]=await tx.select().from(surveyVersions)
    .where(and(eq(surveyVersions.id,campaign.surveyVersionId),
      eq(surveyVersions.lifecycle,"published"))).limit(1);
  if(!version)throw new AuthorizationError("published survey version");
  const [definition]=await tx.select().from(surveyDefinitions)
    .where(and(eq(surveyDefinitions.id,version.surveyId),
      eq(surveyDefinitions.status,"active"))).limit(1);
  if(!definition||!["learner","any"].includes(definition.intendedAudience))
    throw new AuthorizationError("survey audience");
  const [branch]=await tx.select({id:surveyQuestionBranchRules.id}).from(surveyQuestionBranchRules)
    .where(eq(surveyQuestionBranchRules.surveyVersionId,version.id)).limit(1);
  if(branch)throw new Error("Branching surveys require dedicated support");
  const rows=await tx.select().from(surveyQuestions)
    .where(eq(surveyQuestions.surveyVersionId,version.id))
    .orderBy(asc(surveyQuestions.ordinal));
  if(!rows.length||rows.length>100||rows.some(q=>q.safetyTriage||q.questionType==="matrix"))
    throw new Error("This survey requires protected or specialized response processing");
  const options=await tx.select().from(surveyQuestionOptions)
    .where(inArray(surveyQuestionOptions.questionId,rows.map(q=>q.id)))
    .orderBy(asc(surveyQuestionOptions.ordinal));
  const questions=rows.map(q=>({
    id:q.id,prompt:q.promptText,type:q.questionType,required:q.required,
    min:q.ratingMin,max:q.ratingMax,
    options:options.filter(o=>o.questionId===q.id).map(o=>({id:o.id,label:o.label})),
  }));
  const [existing]=await tx.select({id:surveyResponses.id}).from(surveyResponses)
    .where(eq(surveyResponses.invitationId,invitation.id)).limit(1);
  return {access,campaign,version,invitation,definition,questions,existing};
}
/**
 * Discover published and personally invited feedback surveys for this course
 * attempt. The campaign's published survey and consent evidence are checked;
 * neither URLs nor per-organization hardcoding are required.
 */
export const listNoncreditCourseSurveys=async(request:Request,raw:unknown)=>{const data=parseCommandInput(courseInput,raw);
    const context=await getInstructionalLearnerContext(request);
    requireLearner(context);
    return db.transaction(async tx=>{
      const access=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId,true);
      if(access.source!=="noncredit"&&access.source!=="class")
        throw new AuthorizationError("authorized learner Course survey participation");
      const allowedClassCampaigns=await classSurveyCampaignIds(tx,context,access);
      const noncreditScope=await noncreditSurveyScope(tx,access);
      if(allowedClassCampaigns?.length===0)return [];
      const now=new Date();
      const noncreditIsolation=access.source==="noncredit"?
        notExists(tx.select({id:canonicalClassSurveyCampaigns.campaignId})
          .from(canonicalClassSurveyCampaigns)
          .where(eq(canonicalClassSurveyCampaigns.campaignId,surveyCampaigns.id))):
        undefined;
      const rows=await tx.select({
        campaignId:surveyCampaigns.id,title:surveyDefinitions.title,
        invitationId:surveyInvitations.id,
      }).from(surveyCampaigns)
      .innerJoin(surveyInvitations,and(
        eq(surveyInvitations.campaignId,surveyCampaigns.id),
        eq(surveyInvitations.invitedPersonId,context.actorPersonId),
      ))
      .innerJoin(surveyVersions,and(
        eq(surveyVersions.id,surveyCampaigns.surveyVersionId),
        eq(surveyVersions.lifecycle,"published"),
      ))
      .innerJoin(surveyDefinitions,and(
        eq(surveyDefinitions.id,surveyVersions.surveyId),
        eq(surveyDefinitions.status,"active"),
        inArray(surveyDefinitions.intendedAudience,["learner","any"]),
      ))
      .innerJoin(evidenceDocumentVersions,
        eq(evidenceDocumentVersions.id,surveyCampaigns.surveyPermissionEvidenceId))
      .where(and(
        eq(surveyCampaigns.deploymentId,access.deploymentId),
        noncreditScope?eq(surveyCampaigns.offeringId,noncreditScope.offeringId):undefined,
        noncreditScope?eq(surveyCampaigns.operatingOrganizationId,noncreditScope.operatingOrganizationId):undefined,
        allowedClassCampaigns?inArray(surveyCampaigns.id,allowedClassCampaigns):undefined,
        noncreditIsolation,
        eq(surveyCampaigns.responseMode,"identified"),
        eq(surveyCampaigns.status,"active"),
        lte(surveyCampaigns.startsAt,now),
        or(isNull(surveyCampaigns.endsAt),gt(surveyCampaigns.endsAt,now)),
        lte(surveyInvitations.sentAt,now),
        or(isNull(surveyInvitations.dueAt),gt(surveyInvitations.dueAt,now)),
        lte(evidenceDocumentVersions.verifiedAt,now),
        isNotNull(evidenceDocumentVersions.verifiedByPersonId),
        or(isNull(evidenceDocumentVersions.validFrom),
           lte(evidenceDocumentVersions.validFrom,now.toISOString().slice(0,10))),
        or(isNull(evidenceDocumentVersions.validThrough),
           gte(evidenceDocumentVersions.validThrough,now.toISOString().slice(0,10))),
      )).limit(30);
      return rows.map(row=>({campaignId:row.campaignId,title:row.title}));
    });
  };

export const getCourseSurvey=async(request:Request,raw:unknown)=>{const data=parseCommandInput(scope,raw);
    const context=await getInstructionalLearnerContext(request);
    requireLearner(context);
    return db.transaction(async tx=>{
      const survey=await loadCourseSurvey(tx,context,data);
      return {campaignId:survey.campaign.id,surveyVersionId:survey.version.id,
        title:survey.definition.title,submitted:!!survey.existing,
        questions:survey.existing?[]:survey.questions};
    });
  };

export const submitCourseSurvey=async(request:Request,raw:unknown)=>{const data=parseCommandInput(submission,raw);
    const context=await getInstructionalLearnerContext(request);
    requireLearner(context);
    return db.transaction(async tx=>{
      const survey=await loadCourseSurvey(tx,context,data);
      if(survey.existing)return {responseId:survey.existing.id,alreadySubmitted:true};
      const definitions:SurveyQuestion[]=survey.questions.map(q=>({
        id:q.id,type:q.type,required:q.required,min:q.min,max:q.max,
        options:q.options.map(o=>({id:o.id})),
      }));
      let answers:ReturnType<typeof validateCourseSurveyAnswers>;
      try{answers=validateCourseSurveyAnswers(definitions,data.answers);}catch(error){if(error instanceof SurveyValidationError)throw new DomainError("VALIDATION_FAILED",error.message);throw error;}
      const [response]=await tx.insert(surveyResponses).values({
        campaignId:survey.campaign.id,surveyVersionId:survey.version.id,
        respondentMode:"identified",invitationId:survey.invitation.id,
      }).returning({id:surveyResponses.id});
      if(!response)throw new Error("Survey response could not be saved");
      for(const answer of answers) {
        const [saved]=await tx.insert(surveyAnswers).values({
          responseId:response.id,surveyVersionId:survey.version.id,
          questionId:answer.questionId,answerText:answer.text,
          answerNumeric:answer.number===null?null:String(answer.number),
          answerBoolean:null,sensitiveRedacted:false,
        }).returning({id:surveyAnswers.id});
        if(!saved)throw new Error("Survey answer could not be saved");
        if(answer.optionIds.length)await tx.insert(surveyAnswerChoices).values(
          answer.optionIds.map(optionId=>({answerId:saved.id,questionId:answer.questionId,optionId})),
        );
      }
      const metadata={courseAttemptId:survey.access.courseAttemptId,
        source:survey.access.source,
        campaignId:survey.campaign.id,questionCount:answers.length};
      await writeCanonicalAudit(tx,{actorPersonId:context.actorPersonId,
        owningOrganizationId:survey.campaign.operatingOrganizationId,
        eventCode:"learning.survey.submitted",entityKind:"survey_response",
        entityId:response.id,payload:metadata});
      await emitCanonicalDomainEvent(tx,{eventType:"LearningSurveySubmitted",
        aggregateType:"survey_response",aggregateId:response.id,
        actorPersonId:context.actorPersonId,payload:metadata});
      return {responseId:response.id,alreadySubmitted:false};
    });
  };
