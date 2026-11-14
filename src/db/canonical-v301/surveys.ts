import { boolean, integer, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
const id = () => uuid("id").defaultRandom().primaryKey();

/** Existing v3.0.1 canonical SQL owns all constraints, review gates and RLS. */
export const surveyDefinitions = educationV30.table("survey_definitions", {
  id:id(),ownerOrganizationId:uuid("owner_organization_id").notNull(),
  code:text("code").notNull(),title:text("title").notNull(),
  purposeCode:text("purpose_code").notNull(),
  intendedAudience:text("intended_audience").notNull(),
  status:text("status").$type<"active"|"retired">().notNull(),
});
export const surveyVersions = educationV30.table("survey_versions", {
  id:id(), surveyId:uuid("survey_id").notNull(),
  versionNo:integer("version_no").notNull(),locale:text("locale").notNull(),
  lifecycle:text("lifecycle").$type<"draft"|"published">().notNull(),
  publishedAt:timestamp("published_at",{withTimezone:true}),
});
export const surveyQuestions = educationV30.table("survey_questions", {
  id:id(),surveyVersionId:uuid("survey_version_id").notNull(),
  questionKey:text("question_key").notNull(),promptText:text("prompt_text").notNull(),
  ordinal:integer("ordinal").notNull(),
  questionType:text("question_type").$type<"single_choice"|"multiple_choice"|"rating"|"likert"|"nps"|"text"|"matrix">().notNull(),
  required:boolean("required").notNull(),safetyTriage:boolean("safety_triage").notNull(),
  ratingMin:integer("rating_min"),ratingMax:integer("rating_max"),
});
export const surveyQuestionOptions = educationV30.table("survey_question_options", {
  id:id(),questionId:uuid("question_id").notNull(),
  optionKey:text("option_key").notNull(),label:text("label").notNull(),
  ordinal:integer("ordinal").notNull(),numericValue:numeric("numeric_value",{precision:12,scale:5}),
});
export const surveyQuestionBranchRules = educationV30.table("survey_question_branch_rules", {
  id:id(),surveyVersionId:uuid("survey_version_id").notNull(),
  sourceQuestionId:uuid("source_question_id").notNull(),
  targetQuestionId:uuid("target_question_id").notNull(),
  sourceOptionId:uuid("source_option_id").notNull(), action:text("action").notNull(),
});
export const surveyCampaigns = educationV30.table("survey_campaigns", {
  id:id(),surveyVersionId:uuid("survey_version_id").notNull(),
  operatingOrganizationId:uuid("operating_organization_id").notNull(),
  deploymentId:uuid("deployment_id"),offeringId:uuid("offering_id"),
  responseMode:text("response_mode").$type<"identified"|"confidential"|"anonymous">().notNull(),
  status:text("status").$type<"draft"|"scheduled"|"active"|"paused"|"closed">().notNull(),
  startsAt:timestamp("starts_at",{withTimezone:true}).notNull(),
  endsAt:timestamp("ends_at",{withTimezone:true}),
  surveyPermissionEvidenceId:uuid("survey_permission_evidence_id"),
});
export const surveyInvitations = educationV30.table("survey_invitations", {
  id:id(),campaignId:uuid("campaign_id").notNull(),
  invitedPersonId:uuid("invited_person_id").notNull(),
  sentAt:timestamp("sent_at",{withTimezone:true}),
  dueAt:timestamp("due_at",{withTimezone:true}),
});
export const surveyResponses = educationV30.table("survey_responses", {
  id:id(),campaignId:uuid("campaign_id").notNull(),
  surveyVersionId:uuid("survey_version_id").notNull(),
  respondentMode:text("respondent_mode").$type<"identified"|"confidential"|"anonymous">().notNull(),
  invitationId:uuid("invitation_id"),submittedAt:timestamp("submitted_at",{withTimezone:true}).notNull(),
  languageCode:text("language_code").notNull(),
});
export const surveyAnswers = educationV30.table("survey_answers", {
  id:id(),responseId:uuid("response_id").notNull(),
  surveyVersionId:uuid("survey_version_id").notNull(),
  questionId:uuid("question_id").notNull(),
  answerText:text("answer_text"),answerNumeric:numeric("answer_numeric",{precision:15,scale:5}),
  answerBoolean:boolean("answer_boolean"),sensitiveRedacted:boolean("sensitive_redacted").notNull(),
});
export const surveyAnswerChoices = educationV30.table("survey_answer_choices", {
  answerId:uuid("answer_id").notNull(),
  questionId:uuid("question_id").notNull(),
  optionId:uuid("option_id").notNull(),
});
