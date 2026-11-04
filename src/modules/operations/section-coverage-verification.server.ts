import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, people, programResponsibilityAssignments,
  roleAssignments, schoolConfigurationVersions, sites,
} from "@/db/schema";
import { sectionFacilitatorKey } from "@/domain/site-section-delegation";
import { coversLocalSupervisionBlock } from "@/domain/onsite-supervision-coverage";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { loadRoomCoverageSchedules } from "./room-coverage.server";
import { roomCoverageOccurs, type RoomCoverageWindow } from "@/domain/room-coverage";
import { addCalendarDays, dateOnlyDayStartInTimezone } from "@/modules/calendar/timezone";
import { verifiedStaffIdentityPredicate } from "@/modules/identity/verified-staff-identity.server";

type FacilitatorTerm = { id: string; effectiveFrom: Date; effectiveThrough: Date; roomCoverage?: RoomCoverageWindow };
type VerifiedFacilitatorTerm = FacilitatorTerm & { alternatives?: FacilitatorTerm[] };

type Reader = Pick<typeof db, "select">;
export type ScheduledSectionAdult = {
  programId: string;
  sectionId: string;
  personId: string;
};

/**
 * Batch-resolve named Section appointments without trusting a browser staff
 * identity or treating a Site-wide account grant as Section coverage.
 * Return the verified assignment's effective term, NOT a claim of physical
 * attendance, legal supervision eligibility or training.
 */
export async function verifiedScheduledSectionFacilitators(
  tx: Reader,
  scope: { siteId: string; organizationId: string },
  candidates: readonly ScheduledSectionAdult[],
) {
  if (!candidates.length) return new Map<string, VerifiedFacilitatorTerm>();

  const programIds = [...new Set(candidates.map(candidate => candidate.programId))];
  const configurations = await tx.select({
    id: schoolConfigurationVersions.id,
    programId: schoolConfigurationVersions.programId,
    version: schoolConfigurationVersions.version,
  }).from(schoolConfigurationVersions)
    .where(inArray(schoolConfigurationVersions.programId, programIds))
    .orderBy(desc(schoolConfigurationVersions.version));
  const activeConfigurationByProgram = new Map<string, string>();
  for (const config of configurations) {
    if (!activeConfigurationByProgram.has(config.programId))
      activeConfigurationByProgram.set(config.programId, config.id);
  }
  const keys = [...new Set(candidates.map(candidate =>
    sectionFacilitatorKey(candidate.sectionId, candidate.personId)))];
  const activeConfigIds = [...activeConfigurationByProgram.values()];
  const rows = await tx.select({
    id: programResponsibilityAssignments.id,
    roleAssignmentId: roleAssignments.id,
    key: programResponsibilityAssignments.responsibilityKey,
    configurationVersionId: programResponsibilityAssignments.configurationVersionId,
    organizationId: programResponsibilityAssignments.accountableOrganizationId,
    personId: roleAssignments.personId,
    programId: roleAssignments.programId,
    siteId: roleAssignments.siteId,
    effectiveFrom: programResponsibilityAssignments.effectiveFrom,
    effectiveThrough: programResponsibilityAssignments.effectiveThrough,
  }).from(programResponsibilityAssignments)
    .innerJoin(roleAssignments, eq(roleAssignments.id,
      programResponsibilityAssignments.responsibleRoleAssignmentId))
    .innerJoin(accountPersonGrants, and(
      eq(accountPersonGrants.personId, roleAssignments.personId),
      eq(accountPersonGrants.organizationId, roleAssignments.organizationId),
      eq(accountPersonGrants.siteId, roleAssignments.siteId),
      eq(accountPersonGrants.role, roleAssignments.roleKey),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      inArray(programResponsibilityAssignments.configurationVersionId, activeConfigIds),
      inArray(programResponsibilityAssignments.responsibilityKey, keys),
      eq(programResponsibilityAssignments.accountableOrganizationId, scope.organizationId),
      eq(roleAssignments.organizationId, scope.organizationId),
      eq(roleAssignments.siteId, scope.siteId),
      eq(roleAssignments.roleKey, "room_facilitator"),
      sql`${roleAssignments.metadata}->>'origin' = 'local_section_facilitator'`,
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify(["onsite.attendance.record"])}::jsonb`,
      eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false),
      verifiedStaffIdentityPredicate(),
      eq(people.active, true),
    ));

  const expected = new Map<string, ScheduledSectionAdult>(candidates.map(candidate => [
    candidate.programId + ":" + sectionFacilitatorKey(candidate.sectionId, candidate.personId),
    candidate,
  ] as const));
  const verified = new Map<string, VerifiedFacilitatorTerm>();
  for (const row of rows) {
    if (!row.programId || !row.effectiveFrom || !row.effectiveThrough) continue;
    if (activeConfigurationByProgram.get(row.programId) !== row.configurationVersionId)
      continue;
    const matchKey = row.programId + ":" + row.key;
    const candidate = expected.get(matchKey);
    if (!candidate || candidate.personId !== row.personId ||
        row.organizationId !== scope.organizationId || row.siteId !== scope.siteId ||
        row.key !== sectionFacilitatorKey(candidate.sectionId, candidate.personId)) continue;
    verified.set(matchKey, {
      id: row.roleAssignmentId,
      effectiveFrom: row.effectiveFrom, effectiveThrough: row.effectiveThrough,
    });
  }
  const schedules = await loadRoomCoverageSchedules(tx, scope.siteId);
  const [site] = await tx.select({ timezone: sites.timezone }).from(sites).where(and(
    eq(sites.id, scope.siteId), eq(sites.organizationId, scope.organizationId))).limit(1);
  const personIds = [...new Set(candidates.map(candidate => candidate.personId))];
  const identities = await tx.select({ personId: people.id }).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(inArray(people.id, personIds), eq(accountPersonGrants.role, "room_facilitator"),
      eq(accountPersonGrants.organizationId, scope.organizationId), eq(accountPersonGrants.siteId, scope.siteId),
      eq(accountPersonGrants.active, true), eq(people.active, true), eq(accessAccounts.disabled, false),
      verifiedStaffIdentityPredicate()));
  if (site) for (const schedule of schedules) {
    for (const candidate of candidates) {
      if (!identities.some(row => row.personId === candidate.personId) ||
          ![schedule.primaryPersonId, schedule.backupPersonId].includes(candidate.personId) ||
          !schedule.sections.some(row => row.programId === candidate.programId && row.sectionId === candidate.sectionId)) continue;
      const key = candidate.programId + ":" + sectionFacilitatorKey(candidate.sectionId, candidate.personId);
      const term: FacilitatorTerm = {
        id: schedule.id + ":" + schedule.revision,
        effectiveFrom: dateOnlyDayStartInTimezone(schedule.startsOn, site.timezone),
        effectiveThrough: dateOnlyDayStartInTimezone(addCalendarDays(schedule.endsOn, 1), site.timezone),
        roomCoverage: schedule,
      };
      const existing = verified.get(key);
      verified.set(key, existing ? { ...existing, alternatives: [...(existing.alternatives ?? []), term] } : term);
    }
  }
  return verified;
}

export function scheduledBlockHasNamedFacilitator(
  verified: ReadonlyMap<string, {
    id?: string; effectiveFrom: Date; effectiveThrough: Date; roomCoverage?: RoomCoverageWindow;
    alternatives?: FacilitatorTerm[];
  }>,
  input: ScheduledSectionAdult & {
    date: string; timeZone: string; startsAtLocal: string | null;
    endsAtLocal: string | null;
  },
): boolean {
  if (!input.startsAtLocal || !input.endsAtLocal) return false;
  const startsAtLocal = input.startsAtLocal, endsAtLocal = input.endsAtLocal;
  const term = verified.get(input.programId + ":" +
    sectionFacilitatorKey(input.sectionId, input.personId));
  if (!term) return false;
  return [term, ...(term.alternatives ?? [])].some(candidate =>
    (!candidate.roomCoverage || roomCoverageOccurs(candidate.roomCoverage, input.date, startsAtLocal, endsAtLocal)) &&
    coversLocalSupervisionBlock({
    date: input.date, timeZone: input.timeZone,
    startsAtLocal,
    endsAtLocal,
    effectiveFrom:candidate.effectiveFrom,effectiveThrough:candidate.effectiveThrough,
  }));
}
