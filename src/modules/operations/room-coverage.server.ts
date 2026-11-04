import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, enrollments, people, programs, roomCoverageSchedules,
  roomCoverageSections, sections, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { personDisplayName } from "@/domain/person-name";
import { assertRoomCoverageManager, roomCoverageOccurs, roomCoverageOverlaps,
  roomCoverageScopeSchema, saveRoomCoverageSchema } from "@/domain/room-coverage";
import { siteDate } from "@/domain/expected-attendance";
import { verifiedStaffIdentityPredicate } from "@/modules/identity/verified-staff-identity.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { listSiteRooms, requireSiteRoom } from "./site-rooms.server";
import type { z } from "zod";

type Reader = Pick<typeof db, "select">;
export async function siteUsesRoomCoverage(tx: Reader, siteId: string) {
  const [row] = await tx.select({ id: roomCoverageSchedules.id }).from(roomCoverageSchedules)
    .where(eq(roomCoverageSchedules.siteId, siteId)).limit(1);
  return !!row;
}
export async function loadRoomCoverageSchedules(tx: Reader, siteId: string) {
  const schedules = await tx.select().from(roomCoverageSchedules)
    .where(and(eq(roomCoverageSchedules.siteId, siteId), isNull(roomCoverageSchedules.retiredAt)))
    .orderBy(asc(roomCoverageSchedules.id)).for("share").limit(501);
  if (schedules.length > 500) throw new Error("Complete room coverage records are required");
  const links = schedules.length ? await tx.select({
    coverageId: roomCoverageSections.coverageId, sectionId: sections.id, programId: sections.programId,
  }).from(roomCoverageSections).innerJoin(sections, and(
    eq(sections.id, roomCoverageSections.sectionId), eq(sections.siteId, siteId), eq(sections.active, true)))
    .where(inArray(roomCoverageSections.coverageId, schedules.map(row => row.id))) : [];
  return schedules.map(row => ({ ...row,
    sections: links.filter(link => link.coverageId === row.id) }));
}
export type RoomCoverage = Awaited<ReturnType<typeof loadRoomCoverageSchedules>>[number];
export async function activeRoomCoverageSectionIds(tx: Reader, actor: AccessContext, programId: string, date?: string) {
  if (actor.role !== "room_facilitator" || !actor.grantSiteId || actor.sessionAccountId ||
      !actor.scope.programIds?.includes(programId)) return [];
  const [site] = await tx.select({ timezone: sites.timezone }).from(sites)
    .where(eq(sites.id, actor.grantSiteId)).limit(1);
  if (!site) throw new AuthorizationError("original room coverage Site");
  const [identity] = await tx.select({ id: accountPersonGrants.id }).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(eq(accountPersonGrants.id, actor.grantId), eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actor.actorPersonId!), eq(accountPersonGrants.role, "room_facilitator"),
      eq(accountPersonGrants.siteId, actor.grantSiteId), eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false), eq(people.active, true), verifiedStaffIdentityPredicate())).limit(1);
  if (!identity) throw new AuthorizationError("current room facilitator identity");
  const day = siteDate(new Date(), site.timezone);
  const schedules = await loadRoomCoverageSchedules(tx, actor.grantSiteId);
  return [...new Set(schedules.filter(row =>
    (row.primaryPersonId === actor.actorPersonId || row.backupPersonId === actor.actorPersonId) &&
    row.startsOn <= day && row.endsOn >= day && roomCoverageOccurs(row, date ?? day)).flatMap(row => row.sections.filter(section =>
      section.programId === programId).map(section => section.sectionId)))];
}
export function roomCoverageForBlock(schedules: readonly RoomCoverage[], block: {
  sectionId: string; date: string; startsAtLocal: string; endsAtLocal: string;
}) {
  const matching = schedules.filter(row => row.sections.some(section => section.sectionId === block.sectionId) &&
    roomCoverageOccurs(row, block.date, block.startsAtLocal, block.endsAtLocal));
  if (matching.length > 1) throw new DomainError("CONFLICT", "Multiple room coverage assignments match this class");
  return matching[0];
}
export async function roomCoverageOccupancy(tx: Reader, coverage: RoomCoverage) {
  if (!coverage.sections.length) return 0;
  const [row] = await tx.select({ count: sql<number>`count(distinct ${enrollments.studentProfileId})::int` })
    .from(enrollments).where(and(eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
      inArray(enrollments.sectionId, coverage.sections.map(section => section.sectionId))));
  return Number(row?.count ?? 0);
}
async function coverageSite(tx: Reader, actor: AccessContext, siteId?: string, manage = false) {
  const id = siteId ?? actor.grantSiteId;
  if (!id) throw new AuthorizationError("exact Site required");
  const [site] = await tx.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!site || !actor.actorPersonId || actor.sessionAccountId ||
      !actor.scope.organizationIds?.includes(site.organizationId) || !actor.scope.siteIds?.includes(site.id) ||
      (actor.grantSiteId !== null && actor.grantSiteId !== site.id))
    throw new AuthorizationError("original exact-Site room coverage membership");
  if (manage || actor.role !== "room_facilitator") assertRoomCoverageManager(actor, site);
  return site;
}
export async function getRoomCoverageWorkspace(actor: AccessContext, value: z.infer<typeof roomCoverageScopeSchema>) {
  const input = roomCoverageScopeSchema.parse(value);
  const site = await coverageSite(db, actor, input.siteId);
  const canManage = actor.role !== "room_facilitator";
  const all = await loadRoomCoverageSchedules(db, site.id);
  const own = canManage ? all : all.filter(row =>
    row.primaryPersonId === actor.actorPersonId || row.backupPersonId === actor.actorPersonId);
  const staff = await db.select({ id: people.id, first: people.legalFirstName, last: people.legalLastName })
    .from(accountPersonGrants).innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(eq(accountPersonGrants.siteId, site.id), eq(accountPersonGrants.organizationId, site.organizationId),
      eq(accountPersonGrants.role, "room_facilitator"), eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false), eq(people.active, true), verifiedStaffIdentityPredicate(),
      canManage ? undefined : inArray(people.id, [...new Set(own.flatMap(row =>
        [row.primaryPersonId, ...(row.backupPersonId ? [row.backupPersonId] : [])]))]))).limit(501);
  if (staff.length > 500) throw new Error("Complete facilitator directory required");
  const assignedIds = own.flatMap(row => row.sections.map(section => section.sectionId));
  const classes = await db.select({ id: sections.id, title: sections.title, programId: sections.programId,
    programName: programs.name }).from(sections).innerJoin(programs, eq(programs.id, sections.programId))
    .where(and(eq(sections.siteId, site.id), eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId), eq(sections.active, true),
      inArray(programs.id, actor.scope.programIds ?? []),
      sql`${programs.deliveryModel}->>'onsite' = 'true'`,
      canManage ? undefined : inArray(sections.id, assignedIds))).orderBy(asc(sections.title)).limit(501);
  if (classes.length > 500) throw new Error("Complete school class directory required");
  const rooms = await listSiteRooms(db, site.id, true);
  return { siteId: site.id, siteName: site.name, timezone: site.timezone,
    today: siteDate(new Date(), site.timezone), canManage, rooms: rooms.filter(room =>
      canManage || own.some(row => row.roomId === room.id)).map(room => ({
        ...room, retiredAt: room.retiredAt?.toISOString() ?? null,
      })),
    staff: [...new Map(staff.map(row => [row.id, { id: row.id,
      name: personDisplayName({ legalFirstName: row.first, legalLastName: row.last }) }])).values()],
    classes, schedules: own.map(row => ({ id: row.id, roomId: row.roomId, revision: row.revision,
      primaryPersonId: row.primaryPersonId, backupPersonId: row.backupPersonId,
      startsOn: row.startsOn, endsOn: row.endsOn, weekdays: row.weekdays,
      startsAtLocal: row.startsAtLocal, endsAtLocal: row.endsAtLocal,
      sectionIds: row.sections.map(section => section.sectionId),
    })),
  };
}
export async function saveRoomCoverage(actor: AccessContext, value: z.infer<typeof saveRoomCoverageSchema>) {
  const input = saveRoomCoverageSchema.parse(value);
  return db.transaction(async tx => {
    const site = await coverageSite(tx, actor, input.siteId, true);
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, site.id)).for("update");
    await requireSiteRoom(tx, site.id, input.roomId);
    const adults = [input.primaryPersonId, ...(input.backupPersonId ? [input.backupPersonId] : [])];
    const staff = await tx.select({ id: people.id }).from(accountPersonGrants)
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .where(and(inArray(people.id, adults), eq(people.active, true), eq(accountPersonGrants.active, true),
        eq(accessAccounts.disabled, false), eq(accountPersonGrants.siteId, site.id),
        eq(accountPersonGrants.organizationId, site.organizationId), eq(accountPersonGrants.role, "room_facilitator"),
        verifiedStaffIdentityPredicate())).for("share");
    if (adults.some(id => !staff.some(row => row.id === id)))
      throw new AuthorizationError("accepted exact-Site facilitator identities");
    if (input.sectionIds.length) {
      const classes = await tx.select({ id: sections.id }).from(sections)
        .innerJoin(programs, eq(programs.id, sections.programId)).where(and(
          inArray(sections.id, input.sectionIds), eq(sections.siteId, site.id), eq(sections.active, true),
          eq(programs.siteId, site.id), eq(programs.organizationId, site.organizationId),
          inArray(programs.id, actor.scope.programIds ?? []),
          sql`${programs.deliveryModel}->>'onsite' = 'true'`)).for("share");
      if (classes.length !== input.sectionIds.length) throw new AuthorizationError("active onsite classes in this exact school");
    }
    const all = await loadRoomCoverageSchedules(tx, site.id);
    const previous = all.find(row => row.id === input.id);
    const fields = { roomId: input.roomId, primaryPersonId: input.primaryPersonId, backupPersonId: input.backupPersonId,
      startsOn: input.startsOn, endsOn: input.endsOn, weekdays: [...input.weekdays].sort(),
      startsAtLocal: input.startsAtLocal, endsAtLocal: input.endsAtLocal };
    const same = previous && Object.entries(fields).every(([key, value]) =>
      JSON.stringify(previous[key as keyof typeof fields]) === JSON.stringify(value)) &&
      [...previous.sections.map(row => row.sectionId)].sort().join() === [...input.sectionIds].sort().join();
    if (same) return { id: previous.id, revision: previous.revision, changed: false };
    if ((previous?.revision ?? null) !== input.expectedRevision)
      throw new DomainError("CONFLICT", "Room coverage changed; refresh before saving");
    const [occupiedId] = previous ? [] : await tx.select({ id: roomCoverageSchedules.id }).from(roomCoverageSchedules)
      .where(eq(roomCoverageSchedules.id, input.id)).limit(1);
    if (occupiedId) throw new DomainError("CONFLICT", "Room coverage identifier already exists");
    for (const other of all) {
      if (other.id === input.id || !roomCoverageOverlaps(input, other)) continue;
      if (other.roomId === input.roomId || adults.some(id => id === other.primaryPersonId || id === other.backupPersonId) ||
          input.sectionIds.some(id => other.sections.some(section => section.sectionId === id)))
        throw new DomainError("CONFLICT", "A room, adult or class already has overlapping room coverage");
    }
    const revision = (previous?.revision ?? 0) + 1;
    if (previous) {
      await tx.update(roomCoverageSchedules).set({ ...fields, revision, updatedAt: new Date() })
        .where(eq(roomCoverageSchedules.id, previous.id));
      await tx.delete(roomCoverageSections).where(eq(roomCoverageSections.coverageId, previous.id));
    } else await tx.insert(roomCoverageSchedules).values({ id: input.id, siteId: site.id, ...fields });
    if (input.sectionIds.length) await tx.insert(roomCoverageSections).values(input.sectionIds.map(sectionId =>
      ({ coverageId: input.id, sectionId })));
    const scope = { organizationId: site.organizationId, siteId: site.id };
    const eventId = await emitEvent(tx, { eventType: EventTypes.RoomCoverageScheduled,
      aggregateType: "room_coverage", aggregateId: input.id, actorPersonId: actor.actorPersonId,
      ...scope, payload: { ...fields, revision, sectionIds: input.sectionIds } });
    await writeAudit(tx, actor, { action: "site.room_coverage.scheduled", entityType: "room_coverage",
      entityId: input.id, scope, before: previous ? { ...previous, sectionIds: previous.sections.map(row => row.sectionId) } : null,
      after: { ...fields, revision, sectionIds: input.sectionIds }, contextExtras: { domainEventId: eventId } });
    return { id: input.id, revision, changed: true };
  });
}
