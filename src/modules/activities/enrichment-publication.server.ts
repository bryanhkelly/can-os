import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities, activitySeasons, calendarEvents, calendarEventParticipants,
  programs, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { enrichmentPublicationSchema, readEnrichmentPublication } from "@/domain/enrichment-publication";
import { verifyEnrichmentPackages, readEnrichmentPackages, type EnrichmentPackage } from "@/domain/enrichment-packages";
import { listExtendedSessionStaff } from "./extended-learning-sessions.server";
import { assertVerifiedExtendedSeasonOpening, unavailableExtendedSeasonApprovals } from "./registration-policy";
import { readExtendedSeasonApprovals } from "./extended-season-approvals.server";
import { writeAudit, emitEvent } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
/**
 * Explicit publishing of a REGISTRATION offer, not regulatory certification.
 * Reuses existing active-Program, site-grant, session and activity records.
 */
export async function publishExtendedSeason(
  actor: AccessContext,
  input: {
    seasonId: string;
    permissionVersion: string;
    permissionText: string;
    feeAmountCents: number;
    packages?: EnrichmentPackage[];
    operationalResponsibilityConfirmed: true;
  },
) {
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("verified registrar");
  assertCapability(actor, "program.launch.start");
  if (!Number.isSafeInteger(input.feeAmountCents) || input.feeAmountCents < 0 ||
    input.feeAmountCents > 10_000_000)
    throw new Error("Fee amount must be between $0 and $100,000");
  if (!input.operationalResponsibilityConfirmed)
    throw new Error("Registrar must explicitly accept responsibility for onsite operations");

  return db.transaction(async tx => {
    const [season] = await tx.select({
      id: activitySeasons.id, status: activitySeasons.status,
      startsOn: activitySeasons.startsOn, endsOn: activitySeasons.endsOn,
      activityId: activities.id, activityStatus: activities.status,
      activityMetadata: activities.metadata, seasonMetadata: activitySeasons.metadata,
      activitySiteId: activities.siteId,
      capacity: activitySeasons.capacity,
      feeAmountCents: activitySeasons.feeAmountCents,
      programId: programs.id, type: programs.type,
      programStatus: programs.status, creditIssuerId: programs.creditIssuingOrganizationId,
      organizationId: programs.organizationId, programSiteId: programs.siteId,
      academicProviderOrganizationId: programs.academicProviderOrganizationId,
    }).from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .innerJoin(programs, eq(programs.id, activities.programId))
      .where(eq(activitySeasons.id, input.seasonId))
      .for("update", { of: activitySeasons }).limit(1);
    if (!season || !season.programSiteId || season.programSiteId !== season.activitySiteId ||
      !actor.scope.organizationIds?.includes(season.organizationId) ||
      !actor.scope.siteIds?.includes(season.programSiteId) ||
      !actor.scope.programIds?.includes(season.programId))
      throw new AuthorizationError("authorized extended-learning season and site");
    if (!isExtendedLearningType(season.type) || season.creditIssuerId !== null ||
      season.programStatus !== "active" || season.activityStatus !== "active")
      throw new Error("Activate the noncredit Program before publishing registration");
    if (!Number.isSafeInteger(season.capacity) || !season.capacity || season.capacity < 1)
      throw new Error("Set seat capacity before registration");
    const [site] = await tx.select({ organizationId: sites.organizationId })
      .from(sites).where(eq(sites.id, season.programSiteId)).limit(1);
    if (!site || site.organizationId !== season.organizationId)
      throw new AuthorizationError("verified hosting site");
    // Recheck unexpired independent approvals and live staffing inside the
    // publication transaction; the browser's readiness display is not authority.
    const approvals = (await readExtendedSeasonApprovals([{
      seasonId: season.id, programId: season.programId,
      siteId: season.programSiteId, organizationId: season.organizationId,
      academicProviderOrganizationId: season.academicProviderOrganizationId,
      programStatus: season.programStatus, seasonStatus: season.status,
      siteMatchesProgram: season.programSiteId === season.activitySiteId,
      capacity: season.capacity,
    }], tx)).get(season.id) ?? unavailableExtendedSeasonApprovals;
    assertVerifiedExtendedSeasonOpening({
      programStatus: season.programStatus,
      seasonStatus: season.status,
      siteMatchesProgram: season.programSiteId === season.activitySiteId,
      capacity: season.capacity,
      ...approvals,
    }, season.status === "registration" ? "register" : "publish");
    if (season.status === "registration") {
      const existing = readEnrichmentPublication(season.seasonMetadata) ??
        readEnrichmentPublication(season.activityMetadata);
      if (existing?.seasonId === season.id &&
        existing.permissionVersion === input.permissionVersion &&
        existing.permissionText === input.permissionText &&
        season.feeAmountCents === input.feeAmountCents &&
        JSON.stringify(readEnrichmentPackages(season.seasonMetadata)) ===
          JSON.stringify(input.packages ?? []))
        return { seasonId: season.id, status: "registration" as const, created: false };
      throw new Error("Offering already published. Changes require a controlled revision.");
    }
    if (season.status !== "draft") throw new Error("Only draft seasons may be published");
    // Every dated meeting must have a named onsite facilitator. Grant proves
    // identity, NOT licensure/background checks, which remain operator duties.
    const calendar = await tx.select({
      id: calendarEvents.id, metadata: calendarEvents.metadata,
    }).from(calendarEvents).where(and(
      eq(calendarEvents.sourceType, "activity_season"),
      eq(calendarEvents.sourceId, season.id),
      eq(calendarEvents.type, "extended_learning_session"),
      eq(calendarEvents.siteId, season.programSiteId),
      eq(calendarEvents.programId, season.programId),
      eq(calendarEvents.organizationId, season.organizationId),
    ));
    if (!calendar.length) throw new Error("Schedule dated program sessions before publishing");
    const staff = await listExtendedSessionStaff(season.organizationId, season.programSiteId, tx);
    const staffIds = new Set(staff.map(item => item.personId));
    if (calendar.some(item => {
      const details = item.metadata.extendedLearningSession;
      const assigned = details && typeof details === "object" &&
        "facilitatorPersonId" in details ? details.facilitatorPersonId : null;
      return typeof assigned !== "string" || !staffIds.has(assigned) ||
        item.metadata.cancelled === true;
    })) throw new Error("All sessions require a currently eligible onsite facilitator");

    const packages = input.packages?.length
      ? verifyEnrichmentPackages(input.packages, calendar.map(row => row.id))
      : [];
    if (input.packages && !input.packages.length)
      throw new Error("Choose at least one enrollment package or use full-season pricing");
    // Ensure every scheduled day is sold by at least one option, so no
    // disappearing daily rosters or accidentally unsellable sessions.
    if (packages.length) {
      const covered = new Set(packages.flatMap(item => item.sessionIds));
      if (calendar.some(item => !covered.has(item.id)))
        throw new Error("Published packages must cover every dated session");
    }

    const publishedAt = new Date().toISOString();
    const publication = enrichmentPublicationSchema.parse({
      version: 1, permissionVersion: input.permissionVersion,
      permissionText: input.permissionText,
      approvedByPersonId: actor.actorPersonId, publishedAt,
      siteId: season.programSiteId, programId: season.programId,
      seasonId: season.id, operationalResponsibilityConfirmed: true,
    });
    await tx.update(activitySeasons).set({
      metadata: {
        ...season.seasonMetadata,
        enrichmentPublication: publication,
        enrichmentPackages: packages,
      },
      status: "registration", feeAmountCents: input.feeAmountCents,
      updatedAt: new Date(),
    }).where(eq(activitySeasons.id, season.id));
    // Share scheduled meetings only after the explicit offering publication;
    // clear creator-only draft visibility.
    for (const event of calendar) {
      await tx.delete(calendarEventParticipants).where(
        eq(calendarEventParticipants.calendarEventId, event.id));
      await tx.update(calendarEvents).set({
        metadata: { ...event.metadata, extendedLearningDraft: false },
        updatedAt: new Date(),
      }).where(eq(calendarEvents.id, event.id));
    }
    const scope = {
      organizationId: season.organizationId,
      siteId: season.programSiteId, programId: season.programId,
    };
    await writeAudit(tx, actor, {
      action: "activity.season.registration.publish",
      entityType: "activity_season", entityId: season.id, scope,
      before: { status: "draft" },
      after: { status: "registration", permissionVersion: input.permissionVersion,
        feeAmountCents: input.feeAmountCents, publishedAt,
        recordedOperatorAttestation: true, sessionCount: calendar.length,
        packages: packages.map(item => ({ id:item.id, title:item.title,
          priceCents:item.priceCents, sessionIds:item.sessionIds })) },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ExtendedLearningRegistrationPublished,
      aggregateType: "activity_season", aggregateId: season.id,
      actorPersonId: actor.actorPersonId, ...scope,
      payload: { permissionVersion: input.permissionVersion, sessionCount: calendar.length },
    });
    return { seasonId: season.id, status: "registration" as const, created: true };
  });
}
