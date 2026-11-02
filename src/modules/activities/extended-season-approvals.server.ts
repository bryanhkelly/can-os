import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, calendarEvents, documents, organizations, people,
} from "@/db/schema";
import {
  extendedSeasonApprovalCategories, isCurrentExtendedSeasonApproval,
  type ExtendedSeasonApprovalCategory, type ExtendedSeasonApprovalScope,
} from "@/domain/extended-learning-approval";
import { listExtendedSessionStaff } from "./extended-learning-sessions.server";
import type { ExtendedSeasonOpeningEvidence } from "./registration-policy";

type Reader = Pick<typeof db, "select">;
export type ExtendedSeasonApprovalRecord = ExtendedSeasonApprovalScope & {
  programStatus: string | null;
  seasonStatus: string;
  siteMatchesProgram: boolean;
  capacity: number | null;
};

type SessionRow = {
  id: string; seasonId: string | null; startsAt: Date;
  endsAt: Date | null; timezone: string;
  metadata: Record<string, unknown>; siteId: string | null;
  programId: string | null; organizationId: string | null;
};

function assignedStaff(event: SessionRow): string | null {
  const session = event.metadata.extendedLearningSession;
  if (!session || typeof session !== "object" || !("facilitatorPersonId" in session))
    return null;
  return typeof session.facilitatorPersonId === "string" ? session.facilitatorPersonId : null;
}

/** Bind approval to the entire material session schedule, not only its start.
 * Edits to a room, closing time, timezone, facilitator or hosting scope
 * invalidate staffing clearance until an independent reviewer approves again. */
export function extendedStaffingSignature(events: readonly SessionRow[]): string {
  const snapshot = events.map(row => {
    const session = row.metadata.extendedLearningSession;
    const location = session && typeof session === "object" && "location" in session
      && typeof session.location === "string" ? session.location.trim() : null;
    return [row.id, row.startsAt.toISOString(), row.endsAt?.toISOString() ?? null,
      row.timezone, location, assignedStaff(row), row.siteId, row.programId,
      row.organizationId, row.metadata.cancelled === true];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/** One authoritative, batched reader for launch, publication, registration and
 * public discovery. Rechecks reviewer grants, expiry and actual assigned staff.
 */
export async function readExtendedSeasonApprovals(
  seasons: readonly ExtendedSeasonApprovalRecord[],
  executor: Reader = db,
  now = new Date(),
): Promise<Map<string, Pick<ExtendedSeasonOpeningEvidence,
  "approvedSafeguardingCoverage" | "verifiedOnsiteStaffing" |
  "emergencyResponsePlanApproved" | "pickupAndReleasePolicyApproved" |
  "datedSessionsAndCoverageVerified">>> {
  const result = new Map<string, Pick<ExtendedSeasonOpeningEvidence,
    "approvedSafeguardingCoverage" | "verifiedOnsiteStaffing" |
    "emergencyResponsePlanApproved" | "pickupAndReleasePolicyApproved" |
    "datedSessionsAndCoverageVerified">>();
  if (!seasons.length) return result;
  const ids = seasons.map(item => item.seasonId);
  const docs = await executor.select().from(documents).where(and(
    eq(documents.subjectType, "activity_season"), inArray(documents.subjectId, ids),
    inArray(documents.category, [...extendedSeasonApprovalCategories]),
  )).orderBy(desc(documents.createdAt), desc(documents.id));
  const sessions = await executor.select({
    id: calendarEvents.id, seasonId: calendarEvents.sourceId,
    startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone, metadata: calendarEvents.metadata,
    siteId: calendarEvents.siteId, programId: calendarEvents.programId,
    organizationId: calendarEvents.organizationId,
  }).from(calendarEvents).where(and(
    eq(calendarEvents.sourceType, "activity_season"),
    eq(calendarEvents.type, "extended_learning_session"),
    inArray(calendarEvents.sourceId, ids),
  ));
  const reviewerIds = [...new Set(docs.map(doc => doc.verifiedByPersonId).filter(
    (id): id is string => !!id,
  ))];
  const reviewers = reviewerIds.length ? await executor.select({
    personId: accountPersonGrants.personId,
    organizationId: accountPersonGrants.organizationId,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(organizations, eq(organizations.id, accountPersonGrants.organizationId))
    .where(and(
      inArray(accountPersonGrants.personId, reviewerIds),
      eq(accountPersonGrants.role, "can_network_steward"),
      eq(accountPersonGrants.active, true),
      isNull(accountPersonGrants.siteId),
      eq(people.active, true), eq(accessAccounts.disabled, false),
      eq(organizations.type, "can_network"),
    )) : [];
  const staff = new Map<string, Set<string>>();
  for (const season of seasons) {
    const key = `${season.organizationId}:${season.siteId}`;
    if (!staff.has(key)) staff.set(key, new Set(
      (await listExtendedSessionStaff(season.organizationId, season.siteId, executor))
        .map(person => person.personId),
    ));
  }
  for (const season of seasons) {
    const currentDocs = new Map<string, (typeof docs)[number]>();
    for (const doc of docs) if (doc.subjectId === season.seasonId &&
        (!currentDocs.has(doc.category) ||
          Number(doc.metadata.version ?? 0) > Number(currentDocs.get(doc.category)!.metadata.version ?? 0)))
      currentDocs.set(doc.category, doc);
    const actualSessions = sessions.filter(row => row.seasonId === season.seasonId);
    const eligibleStaff = staff.get(`${season.organizationId}:${season.siteId}`) ?? new Set<string>();
    const covered = actualSessions.length > 0 && actualSessions.every(row => {
      const staffId = assignedStaff(row);
      return row.siteId === season.siteId &&
        row.organizationId === season.organizationId && row.programId === season.programId &&
        row.metadata.cancelled !== true && !!row.endsAt && row.endsAt > row.startsAt &&
        !!staffId && eligibleStaff.has(staffId);
    });
    const approved = (category: ExtendedSeasonApprovalCategory) =>
      isCurrentExtendedSeasonApproval(currentDocs.get(category), season, new Set(
        reviewers.filter(item => item.organizationId === season.academicProviderOrganizationId)
          .map(item => item.personId),
      ), now, extendedStaffingSignature(actualSessions));
    result.set(season.seasonId, {
      approvedSafeguardingCoverage: approved("extended_learning_safeguarding"),
      verifiedOnsiteStaffing: covered && approved("extended_learning_staffing"),
      emergencyResponsePlanApproved: approved("extended_learning_emergency"),
      pickupAndReleasePolicyApproved: approved("extended_learning_child_release"),
      datedSessionsAndCoverageVerified: covered,
    });
  }
  return result;
}
