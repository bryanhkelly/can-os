import { asc, desc, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import { assessmentDefinitions, assessmentVersions } from "@/db/canonical-v301/learning";
import { requireCanonicalLabProvider } from "./canonical-capability-lab-access.server";

/** Catalog diagnostics only: do not expose item text, answer keys or learner results. */
export const getCanonicalAssessmentLab = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const { organizationId } = await requireCanonicalLabProvider();
  const definitions = await db.select({
    id: assessmentDefinitions.id,
    key: assessmentDefinitions.assessmentKey,
    title: assessmentDefinitions.title,
    purpose: assessmentDefinitions.purpose,
    status: assessmentDefinitions.status,
  }).from(assessmentDefinitions)
    .where(eq(assessmentDefinitions.ownerOrganizationId, organizationId))
    .orderBy(asc(assessmentDefinitions.title)).limit(100);

  const ids = definitions.map(row => row.id);
  const versions = ids.length ? await db.select({
    assessmentId: assessmentVersions.assessmentId,
    versionNo: assessmentVersions.versionNo,
    lifecycle: assessmentVersions.lifecycle,
    courseVersionId: assessmentVersions.courseVersionId,
  }).from(assessmentVersions)
    .where(inArray(assessmentVersions.assessmentId, ids))
    .orderBy(desc(assessmentVersions.versionNo)) : [];

  return {
    organizationId,
    limit: 100,
    assessments: definitions.map(row => {
      const related = versions.filter(version => version.assessmentId === row.id);
      return {
        ...row,
        versionCount: related.length,
        latestVersionNo: related[0]?.versionNo ?? null,
        latestLifecycle: related[0]?.lifecycle ?? null,
        hasPublishedVersion: related.some(version => version.lifecycle === "published"),
        isCourseLinked: related.some(version => Boolean(version.courseVersionId)),
      };
    }),
  };
});
