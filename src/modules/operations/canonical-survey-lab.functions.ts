import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  surveyDefinitions, surveyVersions, surveyQuestions, surveyQuestionOptions,
  surveyQuestionBranchRules, surveyCampaigns, surveyInvitations, surveyResponses,
} from "@/db/canonical-v301";
import { inspectIdentifiedNoncreditSurvey } from "@/domain/canonical-survey-lab";
import { requireCanonicalLabProvider } from "./canonical-capability-lab-access.server";

const CAMPAIGN_LIMIT = 50;
const DEFINITION_LIMIT = 50;
const QUESTION_LIMIT = 2000;
const OPTION_LIMIT = 4000;

/**
 * Provider-only survey configuration diagnostics, separate from learner response
 * submission. Returns no survey answers, invitation recipients or respondent IDs.
 * All filters derive from the native canonical session, never a browser-supplied ID.
 */
export const getCanonicalSurveyLab = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const { organizationId } = await requireCanonicalLabProvider();

  const definitions = await db.select({
    id: surveyDefinitions.id,
    code: surveyDefinitions.code,
    title: surveyDefinitions.title,
    purposeCode: surveyDefinitions.purposeCode,
    intendedAudience: surveyDefinitions.intendedAudience,
    status: surveyDefinitions.status,
  }).from(surveyDefinitions)
    .where(eq(surveyDefinitions.ownerOrganizationId, organizationId))
    .orderBy(asc(surveyDefinitions.title)).limit(DEFINITION_LIMIT);

  const campaigns = await db.select({
    id: surveyCampaigns.id,
    status: surveyCampaigns.status,
    mode: surveyCampaigns.responseMode,
    startsAt: surveyCampaigns.startsAt,
    endsAt: surveyCampaigns.endsAt,
    permissionEvidenceId: surveyCampaigns.surveyPermissionEvidenceId,
    deploymentId: surveyCampaigns.deploymentId,
    title: surveyDefinitions.title,
    definitionCode: surveyDefinitions.code,
    definitionStatus: surveyDefinitions.status,
    definitionOwnerId: surveyDefinitions.ownerOrganizationId,
    audience: surveyDefinitions.intendedAudience,
    versionId: surveyVersions.id,
    versionNo: surveyVersions.versionNo,
    versionLifecycle: surveyVersions.lifecycle,
    locale: surveyVersions.locale,
  }).from(surveyCampaigns)
    .innerJoin(surveyVersions, eq(surveyCampaigns.surveyVersionId, surveyVersions.id))
    .innerJoin(surveyDefinitions, eq(surveyVersions.surveyId, surveyDefinitions.id))
    .where(eq(surveyCampaigns.operatingOrganizationId, organizationId))
    .orderBy(desc(surveyCampaigns.startsAt)).limit(CAMPAIGN_LIMIT);

  const definitionIds = definitions.map(row => row.id);
  const versionTotals = definitionIds.length ? await db.select({
    surveyId: surveyVersions.surveyId,
    total: count(),
  }).from(surveyVersions)
    .where(inArray(surveyVersions.surveyId, definitionIds))
    .groupBy(surveyVersions.surveyId) : [];
  const versions = definitionIds.length ? await db.select({
    surveyId: surveyVersions.surveyId,
    versionNo: surveyVersions.versionNo,
    lifecycle: surveyVersions.lifecycle,
  }).from(surveyVersions)
    .where(inArray(surveyVersions.surveyId, definitionIds))
    .orderBy(desc(surveyVersions.versionNo)).limit(1000) : [];

  const versionIds = [...new Set(campaigns.map(row => row.versionId))];
  const campaignIds = campaigns.map(row => row.id);
  if (!versionIds.length) {
    return {
      organizationId,
      limits: { campaigns: CAMPAIGN_LIMIT, definitions: DEFINITION_LIMIT },
      definitions: definitions.map(row => ({
        ...row,
        versionCount: versionTotals.find(total => total.surveyId === row.id)?.total ?? 0,
        latestVersion: versions.find(version => version.surveyId === row.id) ?? null,
        versionInventoryComplete: versions.length < 1000,
      })),
      campaigns: [],
    };
  }

  const [questionCounts, questionRows, branchCounts, invitationCounts, responseCounts] =
    await Promise.all([
      db.select({ versionId: surveyQuestions.surveyVersionId, total: count() })
        .from(surveyQuestions).where(inArray(surveyQuestions.surveyVersionId, versionIds))
        .groupBy(surveyQuestions.surveyVersionId),
      db.select({
        id: surveyQuestions.id, versionId: surveyQuestions.surveyVersionId,
        ordinal: surveyQuestions.ordinal, prompt: surveyQuestions.promptText,
        type: surveyQuestions.questionType, required: surveyQuestions.required,
        safetyTriage: surveyQuestions.safetyTriage,
        ratingMin: surveyQuestions.ratingMin, ratingMax: surveyQuestions.ratingMax,
      }).from(surveyQuestions)
        .where(inArray(surveyQuestions.surveyVersionId, versionIds))
        .orderBy(asc(surveyQuestions.surveyVersionId), asc(surveyQuestions.ordinal))
        .limit(QUESTION_LIMIT + 1),
      db.select({ versionId: surveyQuestionBranchRules.surveyVersionId, total: count() })
        .from(surveyQuestionBranchRules)
        .where(inArray(surveyQuestionBranchRules.surveyVersionId, versionIds))
        .groupBy(surveyQuestionBranchRules.surveyVersionId),
      db.select({
        campaignId: surveyInvitations.campaignId, total: count(),
        sent: sql<number>`count(${surveyInvitations.sentAt})::integer`,
      }).from(surveyInvitations)
        .where(inArray(surveyInvitations.campaignId, campaignIds))
        .groupBy(surveyInvitations.campaignId),
      db.select({ campaignId: surveyResponses.campaignId, total: count() })
        .from(surveyResponses)
        .where(inArray(surveyResponses.campaignId, campaignIds))
        .groupBy(surveyResponses.campaignId),
    ]);

  const hasMoreQuestions = questionRows.length > QUESTION_LIMIT;
  const loadedQuestions = questionRows.slice(0, QUESTION_LIMIT);
  const questionIds = loadedQuestions.map(row => row.id);
  const optionRows = questionIds.length ? await db.select({
    id: surveyQuestionOptions.id,
    questionId: surveyQuestionOptions.questionId,
    label: surveyQuestionOptions.label,
    ordinal: surveyQuestionOptions.ordinal,
  }).from(surveyQuestionOptions)
    .where(inArray(surveyQuestionOptions.questionId, questionIds))
    .orderBy(asc(surveyQuestionOptions.ordinal)).limit(OPTION_LIMIT + 1) : [];
  const hasMoreOptions = optionRows.length > OPTION_LIMIT;
  const options = optionRows.slice(0, OPTION_LIMIT);
  const now = new Date();

  return {
    organizationId,
    limits: { campaigns: CAMPAIGN_LIMIT, definitions: DEFINITION_LIMIT },
    definitions: definitions.map(row => ({
      ...row,
      versionCount: versionTotals.find(total => total.surveyId === row.id)?.total ?? 0,
      latestVersion: versions.find(version => version.surveyId === row.id) ?? null,
      versionInventoryComplete: versions.length < 1000,
    })),
    campaigns: campaigns.map(row => {
      const questionCount = Number(questionCounts.find(item => item.versionId === row.versionId)?.total ?? 0);
      const questions = loadedQuestions.filter(item => item.versionId === row.versionId)
        .map(question => ({
          ...question,
          options: options.filter(option => option.questionId === question.id).map(option => ({
            id: option.id, ordinal: option.ordinal, label: option.label,
          })),
        }));
      const invitations = invitationCounts.find(item => item.campaignId === row.id);
      const branchCount = Number(branchCounts.find(item => item.versionId === row.versionId)?.total ?? 0);
      const sentInvitationCount = Number(invitations?.sent ?? 0);
      const preflight = inspectIdentifiedNoncreditSurvey({
        campaignStatus: row.status,
        responseMode: row.mode,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        permissionEvidenceId: row.permissionEvidenceId,
        deploymentId: row.deploymentId,
        definitionStatus: row.definitionStatus,
        audience: row.audience,
        versionLifecycle: row.versionLifecycle,
        questionCount,
        loadedQuestionCount: questions.length,
        hasMoreOptions,
        branchRuleCount: branchCount,
        sentInvitationCount,
        questions: questions.map(q => ({
          questionType: q.type, safetyTriage: q.safetyTriage,
          ratingMin: q.ratingMin, ratingMax: q.ratingMax, optionCount: q.options.length,
        })),
      }, now);
      return {
        ...row,
        questionCount,
        branchCount,
        invitationCount: Number(invitations?.total ?? 0),
        sentInvitationCount,
        responseCount: Number(responseCounts.find(item => item.campaignId === row.id)?.total ?? 0),
        questions: hasMoreQuestions && questions.length !== questionCount ? [] : questions,
        questionPreviewComplete: questions.length === questionCount && !hasMoreOptions,
        preflight,
      };
    }),
  };
});
