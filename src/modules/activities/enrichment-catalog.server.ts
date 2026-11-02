import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { readEnrichmentPublication } from "@/domain/enrichment-publication";
import { readEnrichmentPackages, sessionOccupancy } from "@/domain/enrichment-packages";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { extendedRegistrationOpeningReadiness, unavailableExtendedSeasonApprovals } from "./registration-policy";
import { readExtendedSeasonApprovals } from "./extended-season-approvals.server";

const extended = ["summer_enrichment", "summer_program", "after_school_enrichment"] as const;

/** Shared, publication-checked, public-safe listing for CAN-wide and site
 * catalogs. Site filtering must happen in SQL before limiting rows.
 * Returning one site's records is not permission to publish its website.
 */
/**
 * Public-safe program catalog: published/open noncredit offerings only.
 * No identity, private staffing details, student data, or draft schedules.
 */
export async function readEnrichmentCatalog(siteId?: string, executor: Pick<typeof db, "select"> = db) {
  const rows = await executor.select({
    seasonId: s.activitySeasons.id, name: s.activities.name,
    seasonName: s.activitySeasons.name,
    startsOn: s.activitySeasons.startsOn, endsOn: s.activitySeasons.endsOn,
    status: s.activitySeasons.status,
    feeAmountCents: s.activitySeasons.feeAmountCents,
    capacity: s.activitySeasons.capacity,
    activityStatus: s.activities.status,
    activityMetadata: s.activities.metadata,
    seasonMetadata: s.activitySeasons.metadata,
    siteId: s.sites.id, siteName: s.sites.name,
    programId: s.programs.id, programName: s.programs.name,
    programType: s.programs.type, programStatus: s.programs.status,
    programSiteId: s.programs.siteId,
    organizationId: s.programs.organizationId,
    academicProviderOrganizationId: s.programs.academicProviderOrganizationId,
    creditIssuerId: s.programs.creditIssuingOrganizationId,
    registrationOpensAt: s.activitySeasons.registrationOpensAt,
    registrationClosesAt: s.activitySeasons.registrationClosesAt,
  }).from(s.activitySeasons)
    .innerJoin(s.activities, eq(s.activities.id, s.activitySeasons.activityId))
    .innerJoin(s.programs, eq(s.programs.id, s.activities.programId))
    .innerJoin(s.sites, eq(s.sites.id, s.activities.siteId))
    .where(and(
      // Site filtering occurs before the 200-result limit; never filter a
      // global page in memory and silently omit a smaller site's offerings.
      siteId ? eq(s.activities.siteId, siteId) : undefined,
      eq(s.programs.organizationId, s.sites.organizationId),
      inArray(s.programs.type, extended),
      eq(s.programs.status, "active"),
      eq(s.activities.status, "active"),
      eq(s.activitySeasons.status, "registration"),
    )).orderBy(asc(s.activitySeasons.startsOn)).limit(200);

  const now = new Date();
  const approvals = await readExtendedSeasonApprovals(rows.map(row => ({
    seasonId: row.seasonId, programId: row.programId, siteId: row.siteId,
    organizationId: row.organizationId,
    academicProviderOrganizationId: row.academicProviderOrganizationId,
    programStatus: row.programStatus, seasonStatus: row.status,
    siteMatchesProgram: row.programSiteId === row.siteId, capacity: row.capacity,
  })), executor, now);
  const published = rows.flatMap(row => {
    const permission = readEnrichmentPublication(row.seasonMetadata) ??
      readEnrichmentPublication(row.activityMetadata);
    // Public discovery must agree with the guardian registration transaction.
    if (!extendedRegistrationOpeningReadiness({
      programStatus: row.programStatus,
      seasonStatus: "draft",
      siteMatchesProgram: row.programSiteId === row.siteId,
      capacity: row.capacity,
      ...(approvals.get(row.seasonId) ?? unavailableExtendedSeasonApprovals),
    }).ready) return [];
    if (!permission || !isExtendedLearningType(row.programType) ||
      row.creditIssuerId !== null || row.programSiteId !== row.siteId ||
      permission.seasonId !== row.seasonId ||
      permission.siteId !== row.siteId ||
      permission.programId !== row.programId ||
      row.endsOn < now.toISOString().slice(0, 10)) return [];
    return [{ ...row, permission }];
  });
  const ids = published.map(row => row.seasonId);
  // Read only sessions belonging to already published offerings. Draft-only
  // calendar rows are never returned through the public catalog.
  const sessionRows = ids.length ? await executor.select({
    id: s.calendarEvents.id,
    seasonId: s.calendarEvents.sourceId,
    startsAt: s.calendarEvents.startsAt,
    endsAt: s.calendarEvents.endsAt,
    timezone: s.calendarEvents.timezone,
    metadata: s.calendarEvents.metadata,
  }).from(s.calendarEvents).where(and(
    eq(s.calendarEvents.sourceType, "activity_season"),
    eq(s.calendarEvents.type, "extended_learning_session"),
    inArray(s.calendarEvents.sourceId, ids),
  )).orderBy(asc(s.calendarEvents.startsAt)).limit(6000) : [];
  const firstSession = new Map<string, (typeof sessionRows)[number]>();
  for (const item of sessionRows) if (item.seasonId &&
    item.metadata.extendedLearningDraft === false && !firstSession.has(item.seasonId))
    firstSession.set(item.seasonId, item);
  const registrationRows = ids.length ? await executor.select({
    seasonId: s.activityRegistrations.activitySeasonId,
    status: s.activityRegistrations.status,
    metadata: s.activityRegistrations.metadata,
  }).from(s.activityRegistrations).where(inArray(s.activityRegistrations.activitySeasonId, ids)) : [];
  return published.map(row => {
    const packages = readEnrichmentPackages(row.seasonMetadata);
    const sessions = sessionRows.filter(event => event.seasonId === row.seasonId &&
      event.metadata.extendedLearningDraft === false && event.metadata.cancelled !== true)
      .map(event => event.id ?? "").filter(Boolean);
    const bookings = registrationRows.filter(entry => entry.seasonId === row.seasonId);
    const occupied = sessionOccupancy(sessions, bookings);
    const seatsFor = (ids: readonly string[]): number | null =>
      row.capacity === null ? null : ids.length
        ? Math.max(0, Math.min(...ids.map(id => row.capacity! - (occupied.get(id) ?? row.capacity!))))
        : 0;
    const packageAvailability = packages.map(item => {
      const available = item.sessionIds.every(id => sessions.includes(id));
      return {
        ...item, available,
        seatsRemaining: available ? seatsFor(item.sessionIds) : 0,
      };
    });
    return {
    seasonId: row.seasonId, name: row.name, seasonName: row.seasonName,
    programName: row.programName, programType: row.programType,
    siteName: row.siteName, startsOn: row.startsOn, endsOn: row.endsOn,
    capacity: row.capacity, seatsRemaining: seatsFor(sessions),
    packages: packageAvailability,
    feeAmountCents: row.feeAmountCents ?? 0,
    firstMeeting: firstSession.get(row.seasonId)?.startsAt.toISOString() ?? null,
    meetingTimezone: firstSession.get(row.seasonId)?.timezone ?? null,
    permissionVersion: row.permission.permissionVersion,
    permissionText: row.permission.permissionText,
    registrationOpen: (!row.registrationOpensAt || now >= row.registrationOpensAt) &&
      (!row.registrationClosesAt || now <= row.registrationClosesAt),
  };
  });
}

