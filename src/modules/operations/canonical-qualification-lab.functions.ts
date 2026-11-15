import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { auditEvents, domainEvents } from "@/db/canonical-v301";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  qualificationApplications, qualificationSubjects, qualificationProgramFitAssessments,
  qualificationProgramFitRequirementResults, qualificationProgramFitReviews,
  qualificationResourceNeeds,
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
  const resourceNeeds=assessmentIds.length?await db.select({
    assessmentId:qualificationResourceNeeds.assessmentId,
    id:qualificationResourceNeeds.id,
    resourceCode:qualificationResourceNeeds.resourceCode,
    description:qualificationResourceNeeds.description,
    unitCode:qualificationResourceNeeds.unitCode,
    requiredQuantity:qualificationResourceNeeds.requiredQuantity,
    availableQuantity:qualificationResourceNeeds.availableQuantity,
    estimatedUnitCostCents:qualificationResourceNeeds.estimatedUnitCostCents,
    evidenceVersionId:qualificationResourceNeeds.evidenceVersionId,
    status:qualificationResourceNeeds.status,
  }).from(qualificationResourceNeeds)
    .where(inArray(qualificationResourceNeeds.assessmentId,assessmentIds))
    .orderBy(asc(qualificationResourceNeeds.resourceCode)).limit(2001):[];
  if(resourceNeeds.length>2000)throw new Error("Qualification resource needs exceed reporting bounds");
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
        resources:resourceNeeds.filter(row=>row.assessmentId===latest?.id).map(row=>({
          ...row,
          shortageQuantity:Math.max(0,Number(row.requiredQuantity)-Number(row.availableQuantity)),
          estimatedUnmetCostCents:row.estimatedUnitCostCents===null?null:
            Math.ceil(Math.max(0,Number(row.requiredQuantity)-Number(row.availableQuantity))*
              row.estimatedUnitCostCents),
        })),
        ...summary,
      };
    }),
  };
});

/** Site-admin resource observations are not Site approval, independent
 * verification, a device grant, or a reimbursement claim. Do not overwrite
 * independently reviewed observations; use new assessment versions.
 */
const needInput=z.object({
  assessmentId:z.string().uuid(),
  resourceCode:z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/),
  description:z.string().trim().min(5).max(500),
  unitCode:z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/),
  requiredQuantity:z.number().finite().nonnegative().max(1000000),
  availableQuantity:z.number().finite().nonnegative().max(1000000),
  estimatedUnitCostCents:z.number().int().nonnegative().max(1000000000).nullable(),
}).strict();
export const recordSiteQualificationResourceNeed=createServerFn({method:"POST"})
  .validator((raw:unknown)=>needInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider();
    if(provider.actor.role!=="site_admin")
      throw new AuthorizationError("authorized Site administrator to report resource needs");
    return db.transaction(async tx=>{
      const [assessment]=await tx.select({id:qualificationProgramFitAssessments.id,
        siteId:qualificationSubjects.siteId,status:qualificationApplications.status})
        .from(qualificationProgramFitAssessments)
        .innerJoin(qualificationApplications,eq(
          qualificationApplications.id,qualificationProgramFitAssessments.baseApplicationId))
        .innerJoin(qualificationSubjects,eq(
          qualificationSubjects.id,qualificationProgramFitAssessments.subjectId))
        .where(and(
          eq(qualificationProgramFitAssessments.id,data.assessmentId),
          eq(qualificationApplications.subjectId,qualificationSubjects.id),
          eq(qualificationApplications.applicantOrganizationId,provider.organizationId),
          eq(qualificationSubjects.applicantOrganizationId,provider.organizationId),
          eq(qualificationSubjects.subjectKind,"site"),
          inArray(qualificationSubjects.siteId,provider.siteIds),
        )).limit(1);
      if(!assessment||assessment.status==="withdrawn"||assessment.status==="closed")
        throw new AuthorizationError("active qualification assessment for an authorized Site");
      const [previous]=await tx.select({id:qualificationResourceNeeds.id})
        .from(qualificationResourceNeeds).where(and(
          eq(qualificationResourceNeeds.assessmentId,data.assessmentId),
          eq(qualificationResourceNeeds.resourceCode,data.resourceCode),
        )).limit(1);
      if(previous)throw new Error("Resource code already recorded for this assessment; revise through a new assessment or approved review");
      const [saved]=await tx.insert(qualificationResourceNeeds).values({
        assessmentId:data.assessmentId,resourceCode:data.resourceCode,
        description:data.description,unitCode:data.unitCode,
        requiredQuantity:String(data.requiredQuantity),
        availableQuantity:String(data.availableQuantity),
        estimatedUnitCostCents:data.estimatedUnitCostCents,
        recordedByPersonId:provider.actor.actorPersonId!,status:"reported",
      }).returning({id:qualificationResourceNeeds.id});
      if(!saved)throw new Error("Unable to record the resource observation");
      const payload={assessmentId:data.assessmentId,siteId:assessment.siteId,
        resourceCode:data.resourceCode,requiredQuantity:data.requiredQuantity,
        availableQuantity:data.availableQuantity,verified:false};
      await tx.insert(auditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"qualification.resource_need.reported",
        entityKind:"qualification_resource_need",entityId:saved.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        eventType:"QualificationResourceNeedReported",
        aggregateType:"qualification_resource_need",aggregateId:saved.id,payload,
      });
      return {resourceNeedId:saved.id,status:"reported" as const};
    });
  });
