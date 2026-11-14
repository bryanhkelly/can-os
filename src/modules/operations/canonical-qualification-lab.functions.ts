import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  qualificationApplications, qualificationSubjects, qualificationProgramFitAssessments,
  qualificationProgramFitRequirementResults, qualificationProgramFitReviews,
} from "@/db/canonical-v301/catalog";
import { summarizeQualificationObservations } from "@/domain/canonical-qualification-lab";
import { requireCanonicalLabProvider } from "./canonical-capability-lab-access.server";

/**
 * Site-qualification diagnostics only. No reviewer decisions, private rationale,
 * applicant contacts or evidence document bodies are sent to the browser.
 */
export const getCanonicalQualificationLab = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const { organizationId, siteIds } = await requireCanonicalLabProvider();
  const applications = await db.select({
    id: qualificationApplications.id,
    status: qualificationApplications.status,
    intendedPopulation: qualificationApplications.intendedPopulation,
    subjectId: qualificationSubjects.id,
    subjectKind: qualificationSubjects.subjectKind,
    siteId: qualificationSubjects.siteId,
  }).from(qualificationApplications)
    .innerJoin(qualificationSubjects, eq(qualificationApplications.subjectId, qualificationSubjects.id))
    .where(and(
      eq(qualificationApplications.applicantOrganizationId, organizationId),
      eq(qualificationSubjects.applicantOrganizationId, organizationId),
      inArray(qualificationSubjects.subjectKind, ["site", "proposed_site"]),
      or(isNull(qualificationSubjects.siteId), inArray(qualificationSubjects.siteId, siteIds)),
    ))
    .orderBy(asc(qualificationApplications.id)).limit(100);
  const applicationIds = applications.map(item => item.id);
  if (!applicationIds.length) return { organizationId, limit: 100, applications: [] };

  const assessments = await db.select({
    id: qualificationProgramFitAssessments.id,
    baseApplicationId: qualificationProgramFitAssessments.baseApplicationId,
    subjectId: qualificationProgramFitAssessments.subjectId,
    policyVersionId: qualificationProgramFitAssessments.policyVersionId,
    participantPopulation: qualificationProgramFitAssessments.participantPopulation,
    deliveryContext: qualificationProgramFitAssessments.deliveryContext,
    assessedAt: qualificationProgramFitAssessments.assessedAt,
  }).from(qualificationProgramFitAssessments)
    .where(inArray(qualificationProgramFitAssessments.baseApplicationId, applicationIds))
    .orderBy(desc(qualificationProgramFitAssessments.assessedAt));
  const assessmentIds = assessments.map(row => row.id);
  const [results, reviews] = assessmentIds.length ? await Promise.all([
    db.select({
      assessmentId: qualificationProgramFitRequirementResults.assessmentId,
      policyRequirementId: qualificationProgramFitRequirementResults.policyRequirementId,
      resultOrder: qualificationProgramFitRequirementResults.resultOrder,
      determination: qualificationProgramFitRequirementResults.determination,
      verificationLevel: qualificationProgramFitRequirementResults.verificationLevel,
      sourceEvidenceVersionId: qualificationProgramFitRequirementResults.sourceEvidenceVersionId,
    }).from(qualificationProgramFitRequirementResults)
      .where(inArray(qualificationProgramFitRequirementResults.assessmentId, assessmentIds)),
    db.select({
      assessmentId: qualificationProgramFitReviews.assessmentId,
      reviewOutcome: qualificationProgramFitReviews.reviewOutcome,
      reviewOrder: qualificationProgramFitReviews.reviewOrder,
    }).from(qualificationProgramFitReviews)
      .where(inArray(qualificationProgramFitReviews.assessmentId, assessmentIds))
      .orderBy(desc(qualificationProgramFitReviews.reviewOrder)),
  ]) : [[], []];

  return {
    organizationId, limit: 100,
    applications: applications.map(application => {
      const assessmentsForApplication = assessments.filter(row =>
        row.baseApplicationId === application.id && row.subjectId === application.subjectId);
      const latest = assessmentsForApplication[0] ?? null;
      const summary = summarizeQualificationObservations(
        results.filter(row => row.assessmentId === latest?.id));
      const latestReview = reviews.find(row => row.assessmentId === latest?.id);
      return {
        ...application,
        assessmentCount: assessmentsForApplication.length,
        latestAssessmentId: latest?.id ?? null,
        latestPopulation: latest?.participantPopulation ?? null,
        latestDeliveryContext: latest?.deliveryContext ?? null,
        policyVersionId: latest?.policyVersionId ?? null,
        latestReviewOutcome: latestReview?.reviewOutcome ?? null,
        ...summary,
      };
    }),
  };
});
