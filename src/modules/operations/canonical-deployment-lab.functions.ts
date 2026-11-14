import { and, asc, count, desc, eq, exists, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  blueprintExecutionBatches, blueprintOutputs, deploymentOfferingAdoptions,
  educationOperationOrganizationRoles, educationOperationSites, educationOperations,
  enrollments, noncreditRegistrations, offeringVersions, offerings, programDeployments,
} from "@/db/canonical-v301";
import { currentApprovedAdoption } from "@/domain/canonical-deployment-lab";
import { requireCanonicalLabProvider } from "./canonical-capability-lab-access.server";

/**
 * Read-only canonical deployment diagnostics. An active operator relationship
 * and authorized Site participation are required before any deployment IDs
 * are used for joins or aggregate queries. Never accepts an org/site ID from UI.
 */
export const getCanonicalDeploymentLab = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const { organizationId, siteIds } = await requireCanonicalLabProvider();
  const now = new Date();
  const operator = educationOperationOrganizationRoles;
  const operationSite = educationOperationSites;

  const deployments = await db.select({
    id: programDeployments.id,
    code: programDeployments.code,
    name: programDeployments.name,
    status: programDeployments.status,
    operationName: educationOperations.name,
    operationStatus: educationOperations.status,
    offeringTitle: offerings.title,
    offeringCode: offerings.code,
    offeringStatus: offerings.status,
  }).from(programDeployments)
    .innerJoin(educationOperations, eq(programDeployments.operationId, educationOperations.id))
    .innerJoin(offerings, eq(programDeployments.offeringId, offerings.id))
    .where(and(
      exists(db.select({ id: operator.id }).from(operator).where(and(
        eq(operator.operationId, programDeployments.operationId),
        eq(operator.organizationId, organizationId),
        eq(operator.roleCode, "operator"),
        eq(operator.status, "approved"),
        lte(operator.validFrom, now),
        or(isNull(operator.validThrough), gt(operator.validThrough, now)),
      ))),
      exists(db.select({ id: operationSite.id }).from(operationSite).where(and(
        eq(operationSite.operationId, programDeployments.operationId),
        inArray(operationSite.siteId, siteIds),
        lte(operationSite.validFrom, now),
        or(isNull(operationSite.validThrough), gt(operationSite.validThrough, now)),
      ))),
    ))
    .orderBy(asc(educationOperations.name), asc(programDeployments.name))
    .limit(100);

  const ids = deployments.map(row => row.id);
  if (!ids.length) return { organizationId, deployments: [], limit: 100 };

  const [adoptions, enrollmentCounts, registrationCounts, outputs] = await Promise.all([
    db.select({
      deploymentId: deploymentOfferingAdoptions.deploymentId,
      approvalStatus: deploymentOfferingAdoptions.approvalStatus,
      validFrom: deploymentOfferingAdoptions.validFrom,
      validThrough: deploymentOfferingAdoptions.validThrough,
      versionNo: offeringVersions.versionNo,
      lifecycle: offeringVersions.lifecycle,
    }).from(deploymentOfferingAdoptions)
      .innerJoin(offeringVersions, eq(deploymentOfferingAdoptions.offeringVersionId, offeringVersions.id))
      .where(inArray(deploymentOfferingAdoptions.deploymentId, ids))
      .orderBy(desc(deploymentOfferingAdoptions.validFrom)),
    db.select({ deploymentId: enrollments.deploymentId, total: count() })
      .from(enrollments).where(inArray(enrollments.deploymentId, ids))
      .groupBy(enrollments.deploymentId),
    db.select({ deploymentId: noncreditRegistrations.deploymentId, total: count() })
      .from(noncreditRegistrations).where(inArray(noncreditRegistrations.deploymentId, ids))
      .groupBy(noncreditRegistrations.deploymentId),
    db.select({
      deploymentId: blueprintOutputs.deploymentId,
      executionBatchId: blueprintOutputs.executionBatchId,
      producedAt: blueprintOutputs.producedAt,
    }).from(blueprintOutputs)
      .innerJoin(blueprintExecutionBatches,
        eq(blueprintOutputs.executionBatchId, blueprintExecutionBatches.id))
      .where(and(
        inArray(blueprintOutputs.deploymentId, ids),
        eq(blueprintExecutionBatches.executingOrganizationId, organizationId),
        eq(blueprintExecutionBatches.executionStatus, "executed"),
      )).orderBy(desc(blueprintOutputs.producedAt)),
  ]);

  return {
    organizationId,
    limit: 100,
    deployments: deployments.map(row => {
      const adoptionRows = adoptions.filter(adoption => adoption.deploymentId === row.id);
      const current = currentApprovedAdoption(adoptionRows, now);
      const latest = adoptionRows[0] ?? null;
      const provenance = outputs.find(output => output.deploymentId === row.id);
      return {
        ...row,
        enrollmentCount: enrollmentCounts.find(item => item.deploymentId === row.id)?.total ?? 0,
        noncreditRegistrationCount: registrationCounts.find(item => item.deploymentId === row.id)?.total ?? 0,
        adoptionCount: adoptionRows.length,
        currentVersionNo: current?.versionNo ?? null,
        latestVersionNo: latest?.versionNo ?? null,
        latestAdoptionStatus: latest?.approvalStatus ?? null,
        hasCurrentApprovedAdoption: Boolean(current),
        executionBatchId: provenance?.executionBatchId ?? null,
      };
    }),
  };
});
