import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  offerings, offeringVersions, canonicalOfferingCourses, courseVersions,
  courses, assessmentDefinitions, assessmentVersions,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/** A publisher can prepare one reusable Course activity plan. The published
 * assessment inventory is read-only: assessment keys must NEVER be returned.
 * This does not grant authorship through another organization or local Site.
 */
export const getPublisherCourseActivityOptions=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("authorized publisher staff");
    assertCapability(actor,"curriculum.publish");
    const organizationId=actor.scope.organizationIds?.[0];
    if(!organizationId||actor.scope.organizationIds?.length!==1)
      throw new AuthorizationError("one Course publisher organization");
    const rows=await db.select({
      courseVersionId:courseVersions.id,title:courses.title,
      courseCode:courses.courseCode,
    }).from(courseVersions)
      .innerJoin(courses,eq(courses.id,courseVersions.courseId))
      .innerJoin(canonicalOfferingCourses,
        eq(canonicalOfferingCourses.courseVersionId,courseVersions.id))
      .innerJoin(offeringVersions,and(
        eq(offeringVersions.id,canonicalOfferingCourses.offeringVersionId),
        eq(offeringVersions.lifecycle,"published"),
        isNotNull(offeringVersions.publishedAt)))
      .innerJoin(offerings,and(
        eq(offerings.id,offeringVersions.offeringId),
        eq(offerings.publisherOrganizationId,organizationId),
        eq(offerings.status,"active")))
      .where(and(eq(courseVersions.lifecycle,"published"),
        isNotNull(courseVersions.publishedAt)))
      .orderBy(asc(courses.title)).limit(201);
    const unique=[...new Map(rows.slice(0,200)
      .map(row=>[row.courseVersionId,row] as const)).values()];
    const assessmentRows=unique.length?await db.select({
      courseVersionId:assessmentVersions.courseVersionId,
      id:assessmentVersions.id,title:assessmentDefinitions.title,
      purpose:assessmentDefinitions.purpose,
    }).from(assessmentVersions)
      .innerJoin(assessmentDefinitions,and(
        eq(assessmentDefinitions.id,assessmentVersions.assessmentId),
        eq(assessmentDefinitions.ownerOrganizationId,organizationId),
        eq(assessmentDefinitions.status,"active")))
      .where(and(
        inArray(assessmentVersions.courseVersionId,
          unique.map(row=>row.courseVersionId)),
        eq(assessmentVersions.lifecycle,"published"))).limit(201):[];
    if(assessmentRows.length>200)
      throw new AuthorizationError("published assessment catalog requires pagination");
    return {
      courses:unique.map(row=>({
        ...row,
        publishedKnowledgeChecks:assessmentRows
          .filter(item=>item.courseVersionId===row.courseVersionId&&
            ["formative","practice","readiness","mastery"].includes(item.purpose))
          .map(item=>({versionId:item.id,title:item.title,purpose:item.purpose})),
      })),
      truncated:rows.length>200,
    };
  });
