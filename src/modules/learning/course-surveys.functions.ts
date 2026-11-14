import { and, asc, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, domainEvents, surveyDefinitions, surveyVersions, surveyQuestions,
  surveyQuestionOptions, surveyQuestionBranchRules, surveyCampaigns, surveyInvitations,
  surveyResponses, surveyAnswers, surveyAnswerChoices } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import { validateCourseSurveyAnswers, type SurveyQuestion } from "@/domain/course-survey";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

const id=z.string().uuid();
const scope=z.object({courseAttemptId:id,campaignId:id}).strict();
const submission=scope.extend({answers:z.array(z.object({
  questionId:id,text:z.string().max(4000).optional(),number:z.number().finite().optional(),
  optionIds:z.array(id).max(100).optional(),
}).strict()).max(100)}).strict();
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
function requireLearner(context:CommandContext): asserts context is CommandContext & {actorPersonId:string} {
  if(context.role!=="learner"||!context.actorPersonId)throw new AuthorizationError("canonical learner");
  assertCapability(context,"learning.survey.respond");
}
const privateResult=()=>setResponseHeader("Cache-Control","private, no-store");

/**
 * Identified survey only: person-bound invitations, published versions, and
 * deployment-scoped campaign permissions. Anonymous/confidential surveys,
 * branching, matrix questions, and safeguarding intake require their distinct
 * approved flows. Survey feedback is never an assessment grade.
 */
async function loadCourseSurvey(tx:Tx,context:CommandContext & {actorPersonId:string},data:z.infer<typeof scope>) {
  const access=await authorizeCanonicalCourseAttempt(tx,context,data.courseAttemptId);
  if(access.source!=="noncredit")throw new AuthorizationError("active noncredit course registration");
  const [campaign]=await tx.select().from(surveyCampaigns)
    .where(and(eq(surveyCampaigns.id,data.campaignId),
      eq(surveyCampaigns.deploymentId,access.deploymentId))).limit(1);
  const now=new Date();
  if(!campaign||campaign.status!=="active"||campaign.responseMode!=="identified"||
    campaign.startsAt>now||(campaign.endsAt&&campaign.endsAt<=now)||
    !campaign.surveyPermissionEvidenceId)throw new AuthorizationError("active authorized survey campaign");
  const [invitation]=await tx.select().from(surveyInvitations)
    .where(and(eq(surveyInvitations.campaignId,campaign.id),
      eq(surveyInvitations.invitedPersonId,context.actorPersonId))).limit(1);
  if(!invitation||!invitation.sentAt||(invitation.dueAt&&invitation.dueAt<=now))
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
export const getCourseSurvey=createServerFn({method:"GET"})
  .validator((v:unknown)=>scope.parse(v))
  .handler(async({data})=>{
    privateResult();
    const context=await getInstructionalLearnerContext(getRequest());
    requireLearner(context);
    return db.transaction(async tx=>{
      const survey=await loadCourseSurvey(tx,context,data);
      return {campaignId:survey.campaign.id,surveyVersionId:survey.version.id,
        title:survey.definition.title,submitted:!!survey.existing,
        questions:survey.existing?[]:survey.questions};
    });
  });

export const submitCourseSurvey=createServerFn({method:"POST"})
  .validator((v:unknown)=>submission.parse(v))
  .handler(async({data})=>{
    privateResult();
    const context=await getInstructionalLearnerContext(getRequest());
    requireLearner(context);
    return db.transaction(async tx=>{
      const survey=await loadCourseSurvey(tx,context,data);
      if(survey.existing)return {responseId:survey.existing.id,alreadySubmitted:true};
      const definitions:SurveyQuestion[]=survey.questions.map(q=>({
        id:q.id,type:q.type,required:q.required,min:q.min,max:q.max,
        options:q.options.map(o=>({id:o.id})),
      }));
      const answers=validateCourseSurveyAnswers(definitions,data.answers);
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
        campaignId:survey.campaign.id,questionCount:answers.length};
      await tx.insert(auditEvents).values({actorPersonId:context.actorPersonId,
        owningOrganizationId:survey.campaign.operatingOrganizationId,
        eventCode:"learning.survey.submitted",entityKind:"survey_response",
        entityId:response.id,payload:metadata});
      await tx.insert(domainEvents).values({eventType:"LearningSurveySubmitted",
        aggregateType:"survey_response",aggregateId:response.id,
        actorPersonId:context.actorPersonId,payload:metadata});
      return {responseId:response.id,alreadySubmitted:false};
    });
  });
