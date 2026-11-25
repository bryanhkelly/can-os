import {canonicalClasses,canonicalClassEnrollments,canonicalClassSessions,noncreditRegistrations,noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases} from "@/db/canonical-v301";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents, interestEventRegistrations, interestEvents,
  siteArtifactReleases, siteMarketingPackageReleases,
  siteMarketingPackages, siteRooms, siteIntelligenceVersions, siteBrandVersions, siteLocalContentVersions, programs, sites,
} from "@/db/schema";
import {
  assertReportingSourceOwnerMatches,
  type CanonicalReportingOwner,
  type RequestedReportingScope,
} from "@/domain/reporting-source-owner-policy";
import { EventTypes } from "@/domain/event-types";
import type { ReportableEventType, ReportableSourceKind } from "@/domain/reportable-event-catalog";

type Reader = Pick<typeof db, "select" | "execute">;
/**
 * Validate the actual source's owner, not merely a claimed Site relationship
 * inside a trusted-looking event. A deleted draft is verified against its
 * canonical deletion audit, because its row no longer exists.
 */
export async function assertReportingSourceOwnership(
  reader: Reader,
  event: {
    eventType: ReportableEventType;
    sourceKind: ReportableSourceKind;
    sourceId: string;
    scope: RequestedReportingScope;
  },
): Promise<void> {
  const { eventType, sourceKind, sourceId, scope } = event;
  let owner: CanonicalReportingOwner | null = null;
  switch (sourceKind) {
    case "site":
      owner = { siteId: sourceId };
      break;
    case "site_intelligence_version": {
      const [row]=await reader.select({siteId:siteIntelligenceVersions.siteId,organizationId:siteIntelligenceVersions.organizationId}).from(siteIntelligenceVersions).where(eq(siteIntelligenceVersions.id,sourceId)).limit(1);
      owner=row??null;break;
    }
    case "site_brand_version": {
      const [row]=await reader.select({siteId:siteBrandVersions.siteId,organizationId:sites.organizationId}).from(siteBrandVersions).innerJoin(sites,eq(sites.id,siteBrandVersions.siteId)).where(eq(siteBrandVersions.id,sourceId)).limit(1);
      owner=row??null;break;
    }
    case "site_local_content_version": {
      const [row]=await reader.select({siteId:siteLocalContentVersions.siteId,organizationId:sites.organizationId}).from(siteLocalContentVersions).innerJoin(sites,eq(sites.id,siteLocalContentVersions.siteId)).where(eq(siteLocalContentVersions.id,sourceId)).limit(1);
      owner=row??null;break;
    }
    case "program": {
      const [row]=await reader.select({siteId:programs.siteId,organizationId:programs.organizationId,programId:programs.id}).from(programs).where(eq(programs.id,sourceId)).limit(1);
      owner=row?.siteId?{...row,siteId:row.siteId}:null;break;
    }
    case "site_campaign": {
      const result=await reader.execute(sql`SELECT e.site_id AS "siteId",e.organization_id AS "organizationId"
        FROM public.engagement_campaigns c JOIN public.engagement_definitions e ON e.id=c.engagement_id
        WHERE c.id=${sourceId} AND e.owner_kind='site' AND e.program_id IS NULL
        AND c.owner_scope='site:'||e.site_id::text AND c.sender_scope='organization:'||e.organization_id::text`);
      const row=result.rows[0];
      owner=row&&typeof row.siteId==="string"&&typeof row.organizationId==="string"?{siteId:row.siteId,organizationId:row.organizationId}:null;break;
    }
    case "native_class_enrollment": {
      const [row]=await reader.select({siteId:canonicalClasses.siteId,organizationId:canonicalClasses.operatingOrganizationId}).from(canonicalClassEnrollments)
        .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId)).where(eq(canonicalClassEnrollments.id,sourceId)).limit(1);
      owner=row?.siteId?{siteId:row.siteId,organizationId:row.organizationId}:null;break;
    }
    case "native_class_session": {
      const [row]=await reader.select({siteId:canonicalClasses.siteId,organizationId:canonicalClasses.operatingOrganizationId}).from(canonicalClassSessions)
        .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassSessions.classId)).where(eq(canonicalClassSessions.id,sourceId)).limit(1);
      owner=row?.siteId?{siteId:row.siteId,organizationId:row.organizationId}:null;break;
    }
    case "noncredit_registration": {
      const [row]=await reader.select({siteId:noncreditSelfEnrollmentClaims.siteId,organizationId:noncreditRegistrations.registeringOrganizationId}).from(noncreditRegistrations)
       .innerJoin(noncreditSelfEnrollmentClaims,eq(noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id))
       .innerJoin(noncreditSelfEnrollmentReleases,and(eq(noncreditSelfEnrollmentReleases.id,noncreditSelfEnrollmentClaims.releaseId),eq(noncreditSelfEnrollmentReleases.siteId,noncreditSelfEnrollmentClaims.siteId),eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,noncreditRegistrations.registeringOrganizationId),eq(noncreditSelfEnrollmentClaims.participantPersonId,noncreditRegistrations.participantPersonId),eq(noncreditSelfEnrollmentReleases.deploymentId,noncreditRegistrations.deploymentId),eq(noncreditSelfEnrollmentReleases.adoptionId,noncreditRegistrations.adoptionId),eq(noncreditSelfEnrollmentReleases.offeringVersionId,noncreditRegistrations.offeringVersionId),eq(noncreditSelfEnrollmentReleases.trainingVersionId,noncreditRegistrations.trainingVersionId)))
       .where(eq(noncreditRegistrations.id,sourceId)).limit(1);
      owner=row??null;break;
    }
    case "site_room": {
      const [row] = await reader.select({siteId:siteRooms.siteId}).from(siteRooms)
        .where(eq(siteRooms.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    case "site_marketing_package": {
      // A draft may be permanently deleted (provided it has no released
      // collateral). Earlier Create/Update/Archive events still need replay.
      // The deletion audit is the authoritative ownership tombstone.
      const [row] = await reader.select({
        siteId:siteMarketingPackages.siteId,
        organizationId:siteMarketingPackages.organizationId,
      }).from(siteMarketingPackages)
        .where(eq(siteMarketingPackages.id,sourceId)).limit(1);
      if (eventType === EventTypes.SiteMarketingPackageDeleted && row) {
        throw new Error("Deleted Marketing Package still exists in the canonical source");
      }
      if (row) {
        owner = row;
      } else {
        const [audit] = await reader.select({scope:auditEvents.scope}).from(auditEvents)
          .where(and(
            eq(auditEvents.resourceId,sourceId),
            eq(auditEvents.resourceType,"site_marketing_package"),
            eq(auditEvents.action,"site.marketing_package.delete"),
          )).limit(1);
        const auditScope = audit?.scope;
        owner = auditScope &&
          typeof auditScope.siteId === "string" &&
          typeof auditScope.organizationId === "string"
          ? {siteId:auditScope.siteId,organizationId:auditScope.organizationId}
          : null;
      }
      break;
    }
    case "site_marketing_package_release": {
      const [row] = await reader.select({
        siteId:siteMarketingPackageReleases.siteId,
      }).from(siteMarketingPackageReleases)
        .where(eq(siteMarketingPackageReleases.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    case "site_artifact_release": {
      const [row] = await reader.select({siteId:siteArtifactReleases.siteId})
        .from(siteArtifactReleases)
        .where(eq(siteArtifactReleases.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    case "interest_event": {
      const [row] = await reader.select({
        siteId:interestEvents.siteId,
        organizationId:interestEvents.organizationId,
        programId:interestEvents.programId,
      }).from(interestEvents).where(eq(interestEvents.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    case "interest_event_registration": {
      const [row] = await reader.select({
        siteId:interestEvents.siteId,
        organizationId:interestEvents.organizationId,
        programId:interestEvents.programId,
      }).from(interestEventRegistrations)
        .innerJoin(interestEvents,eq(interestEventRegistrations.eventId,interestEvents.id))
        .where(eq(interestEventRegistrations.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    default:
      throw new Error("Reportable source kind has no canonical ownership resolver");
  }
  assertReportingSourceOwnerMatches(owner, scope);
}
