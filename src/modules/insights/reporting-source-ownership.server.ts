import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents, interestEventRegistrations, interestEvents,
  siteArtifactReleases, siteMarketingPackageReleases,
  siteMarketingPackages, siteRooms,
} from "@/db/schema";
import {
  assertReportingSourceOwnerMatches,
  type CanonicalReportingOwner,
  type RequestedReportingScope,
} from "@/domain/reporting-source-owner-policy";
import { EventTypes } from "@/domain/event-types";
import type { ReportableEventType, ReportableSourceKind } from "@/domain/reportable-event-catalog";

type Reader = Pick<typeof db, "select">;
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
    case "site_room": {
      const [row] = await reader.select({siteId:siteRooms.siteId}).from(siteRooms)
        .where(eq(siteRooms.id,sourceId)).limit(1);
      owner = row ?? null;
      break;
    }
    case "site_marketing_package": {
      if (eventType === EventTypes.SiteMarketingPackageDeleted) {
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
      } else {
        const [row] = await reader.select({
          siteId:siteMarketingPackages.siteId,
          organizationId:siteMarketingPackages.organizationId,
        }).from(siteMarketingPackages)
          .where(eq(siteMarketingPackages.id,sourceId)).limit(1);
        owner = row ?? null;
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
