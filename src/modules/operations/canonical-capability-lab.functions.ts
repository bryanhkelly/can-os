import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentExecutionAttempts, assessmentExecutionResults,
  learnerCourseAttempts, noncreditCompletionDecisions, noncreditCompletionPolicies,
  noncreditRegistrations, noncreditTrainingVersions, surveyCampaigns,
  surveyDefinitions, surveyQuestions, surveyResponses, surveyVersions,
} from "@/db/canonical-v301";
import { requireCanonicalLabProvider } from "./canonical-capability-lab-access.server";
import { selectNoncreditLabAssessmentEvidence } from "@/domain/canonical-capability-lab";

async function readProviderTrainingVersions(organizationId: string) {
  return db.select({
    id: noncreditTrainingVersions.id,
    title: noncreditTrainingVersions.title,
    state: noncreditTrainingVersions.state,
    requiredMinutes: noncreditTrainingVersions.requiredInstructionMinutes,
    assessmentVersionId: noncreditTrainingVersions.assessmentVersionId,
  }).from(noncreditTrainingVersions)
    .where(eq(noncreditTrainingVersions.providerOrganizationId, organizationId))
    .orderBy(asc(noncreditTrainingVersions.title)).limit(100);
}

/**
 * Enrollment experience preview needs training titles only, not participation,
 * assessment evidence, completion decisions or survey response metadata.
 */
export const getCanonicalEnrollmentLabTrainings = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { organizationId } = await requireCanonicalLabProvider();
    return readProviderTrainingVersions(organizationId);
  });

/**
 * Read-only, organization-scoped index for the native canonical provider lab.
 * It never returns learner names, survey answers, question text, secure assessment
 * keys, or cross-provider records. All writes use the existing domain commands.
 */
export const getCanonicalCapabilityLab = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const { actor, organizationId } = await requireCanonicalLabProvider();

  const trainings = await readProviderTrainingVersions(organizationId);

  const participation = await db.select({
    courseAttemptId: learnerCourseAttempts.id,
    courseStatus: learnerCourseAttempts.status,
    registrationId: noncreditRegistrations.id,
    registrationStatus: noncreditRegistrations.status,
    completionPolicyId: noncreditRegistrations.completionPolicyId,
    trainingVersionId: noncreditTrainingVersions.id,
    trainingTitle: noncreditTrainingVersions.title,
  }).from(learnerCourseAttempts)
    .innerJoin(noncreditRegistrations,
      eq(learnerCourseAttempts.noncreditRegistrationId, noncreditRegistrations.id))
    .innerJoin(noncreditTrainingVersions,
      eq(noncreditRegistrations.trainingVersionId, noncreditTrainingVersions.id))
    .where(and(
      eq(noncreditTrainingVersions.providerOrganizationId, organizationId),
      isNull(learnerCourseAttempts.enrollmentId),
      isNull(learnerCourseAttempts.sectionId),
    ))
    .orderBy(desc(learnerCourseAttempts.startedAt)).limit(100);

  const courseIds = participation.map(row => row.courseAttemptId);
  const registrationIds = participation.map(row => row.registrationId);
  const trainingIds = [...new Set(participation.map(row => row.trainingVersionId))];
  const grants = courseIds.length
    ? await db.select({
      id: assessmentAccess.id, courseAttemptId: assessmentAccess.courseAttemptId,
      status: assessmentAccess.accessStatus,
      validFrom: assessmentAccess.validFrom, validThrough: assessmentAccess.validThrough,
    }).from(assessmentAccess).where(inArray(assessmentAccess.courseAttemptId, courseIds))
    : [];
  const grantIds = grants.map(row => row.id);
  const assessmentAttempts = grantIds.length
    ? await db.select({
      id: assessmentExecutionAttempts.id,
      grantId: assessmentExecutionAttempts.accessGrantId,
      state: assessmentExecutionAttempts.state,
      createdAt: assessmentExecutionAttempts.createdAt,
    }).from(assessmentExecutionAttempts)
      .where(inArray(assessmentExecutionAttempts.accessGrantId, grantIds))
      .orderBy(desc(assessmentExecutionAttempts.createdAt))
    : [];
  const assessmentAttemptIds = assessmentAttempts.map(row => row.id);
  const results = assessmentAttemptIds.length
    ? await db.select({
      id: assessmentExecutionResults.id,
      attemptId: assessmentExecutionResults.attemptId,
      status: assessmentExecutionResults.resultStatus,
      revision: assessmentExecutionResults.resultRevision,
      outcome: assessmentExecutionResults.outcome,
      supersedesId: assessmentExecutionResults.supersedesId,
    }).from(assessmentExecutionResults)
      .where(inArray(assessmentExecutionResults.attemptId, assessmentAttemptIds))
      .orderBy(desc(assessmentExecutionResults.resultRevision))
    : [];
  const policies = trainingIds.length
    ? await db.select({
      id: noncreditCompletionPolicies.id,
      trainingVersionId: noncreditCompletionPolicies.trainingVersionId,
      version: noncreditCompletionPolicies.policyVersion,
      minMinutes: noncreditCompletionPolicies.minParticipationMinutes,
      requiresAssessment: noncreditCompletionPolicies.skillsAssessmentRequired,
      effectiveAt: noncreditCompletionPolicies.effectiveAt,
    }).from(noncreditCompletionPolicies)
      .where(inArray(noncreditCompletionPolicies.trainingVersionId, trainingIds))
      .orderBy(desc(noncreditCompletionPolicies.policyVersion))
    : [];
  const decisions = registrationIds.length
    ? await db.select({
      id: noncreditCompletionDecisions.id,
      registrationId: noncreditCompletionDecisions.registrationId,
      outcome: noncreditCompletionDecisions.outcome,
      supersedesId: noncreditCompletionDecisions.supersedesId,
      decidedAt: noncreditCompletionDecisions.decidedAt,
    }).from(noncreditCompletionDecisions)
      .where(inArray(noncreditCompletionDecisions.registrationId, registrationIds))
      .orderBy(desc(noncreditCompletionDecisions.decidedAt))
    : [];
  const now = new Date();
  const supersededDecisions = new Set(decisions.flatMap(item =>
    item.supersedesId ? [item.supersedesId] : []));
  const attempts = participation.map(row => {
    const evidence = selectNoncreditLabAssessmentEvidence(
      grants.filter(item => item.courseAttemptId === row.courseAttemptId),
      assessmentAttempts,
      results,
      now,
    );
    const policy = policies.find(item =>
      item.id === row.completionPolicyId && item.trainingVersionId === row.trainingVersionId);
    const decision = decisions.find(item =>
      item.registrationId === row.registrationId && !supersededDecisions.has(item.id));
    const training = trainings.find(item => item.id === row.trainingVersionId);
    return {
      ...row,
      trainingState: training?.state ?? "unavailable",
      assessmentVersionId: training?.assessmentVersionId ?? null,
      ...evidence,
      policyId: policy?.id ?? null,
      policyVersion: policy?.version ?? null,
      policyMinMinutes: policy?.minMinutes ?? null,
      policyRequiresAssessment: policy?.requiresAssessment ?? false,
      latestDecision: decision?.outcome ?? null,
    };
  });

  const campaigns = await db.select({
    id: surveyCampaigns.id, status: surveyCampaigns.status,
    mode: surveyCampaigns.responseMode, deploymentId: surveyCampaigns.deploymentId,
    versionId: surveyVersions.id, versionNo: surveyVersions.versionNo,
    title: surveyDefinitions.title,
  }).from(surveyCampaigns)
    .innerJoin(surveyVersions, eq(surveyCampaigns.surveyVersionId, surveyVersions.id))
    .innerJoin(surveyDefinitions, eq(surveyVersions.surveyId, surveyDefinitions.id))
    .where(eq(surveyCampaigns.operatingOrganizationId, organizationId))
    .orderBy(asc(surveyDefinitions.title)).limit(100);
  const campaignIds = campaigns.map(row => row.id);
  const versionIds = [...new Set(campaigns.map(row => row.versionId))];
  const questionRows = versionIds.length
    ? await db.select({ versionId: surveyQuestions.surveyVersionId })
      .from(surveyQuestions).where(inArray(surveyQuestions.surveyVersionId, versionIds))
    : [];
  const responseRows = campaignIds.length
    ? await db.select({ campaignId: surveyResponses.campaignId })
      .from(surveyResponses).where(inArray(surveyResponses.campaignId, campaignIds))
    : [];
  const surveys = campaigns.map(row => ({
    ...row,
    questionCount: questionRows.filter(q => q.versionId === row.versionId).length,
    responseCount: responseRows.filter(response => response.campaignId === row.id).length,
  }));

  return {
    organizationId,
    draftAuthoringEnabled: process.env.CAN_CANONICAL_SURVEY_DRAFT_ENABLED === "true",
    surveyPublicationEnabled: process.env.CAN_CANONICAL_SURVEY_PUBLICATION_ENABLED === "true",
    role: actor.role,
    trainings,
    attempts,
    surveys,
    limitPerCollection: 100,
  };
});
