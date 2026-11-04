import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, sections, siteRooms, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { DomainError } from "@/domain/errors";
import { assertSiteRoomReader, assertSiteRoomManager, assignSectionRoomSchema, createSiteRoomSchema, retireSiteRoomSchema, siteRoomsScopeSchema, updateSiteRoomSchema } from "@/domain/site-rooms";
import { emitEvent, writeAudit } from "@/platform/mutation";
import type { z } from "zod";
import { assertRoomCoverageManager, createRoomAtSiteSchema } from "@/domain/room-coverage";

type Reader = Pick<typeof db, "select">;

async function roomSchool(tx: Reader, actor: AccessContext, programId: string, access: "read" | "manage" = "manage") {
  const [school] = await tx.select({
    programId: programs.id, organizationId: programs.organizationId, siteId: sites.id,
  }).from(programs).innerJoin(sites, and(eq(sites.id, programs.siteId),
    eq(sites.organizationId, programs.organizationId))).where(eq(programs.id, programId)).limit(1);
  if (!school) throw new AuthorizationError("existing school-owned Site");
  if (access === "read") assertSiteRoomReader(actor, school);
  else assertSiteRoomManager(actor, school);
  return school;
}

export async function listSiteRooms(tx: Reader, siteId: string, includeRetired = false) {
  const rooms = await tx.select({ id: siteRooms.id, name: siteRooms.name, capacity: siteRooms.capacity,
    revision: siteRooms.revision, retiredAt: siteRooms.retiredAt })
    .from(siteRooms).where(and(eq(siteRooms.siteId, siteId),
      includeRetired ? undefined : isNull(siteRooms.retiredAt))).orderBy(asc(siteRooms.name)).limit(1001);
  if (rooms.length > 1000) throw new Error("Room directory exceeds the supported limit; contact school administration");
  return rooms;
}

export async function getSchoolRooms(actor: AccessContext, value: z.infer<typeof siteRoomsScopeSchema>) {
  const input = siteRoomsScopeSchema.parse(value);
  const school = await roomSchool(db, actor, input.programId, "read");
  let canManage = false;
  try { assertSiteRoomManager(actor, school); canManage = true; }
  catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
  const classes = await db.select({ id: sections.id, title: sections.title, code: sections.code,
    roomId: sql<string|null>`${sections.metadata}->>'physicalRoomId'` })
    .from(sections).where(and(eq(sections.programId, school.programId),
      eq(sections.siteId, school.siteId), eq(sections.active, true)))
    .orderBy(asc(sections.title)).limit(1001);
  if (classes.length > 1000) throw new Error("Classroom setup exceeds the supported class limit");
  return { ...school, canManage, rooms: (await listSiteRooms(db, school.siteId, true)).map(room => ({
    ...room, retiredAt: room.retiredAt?.toISOString() ?? null,
  })), classes };
}

export async function createSchoolRoom(actor: AccessContext, value: z.infer<typeof createSiteRoomSchema>) {
  const input = createSiteRoomSchema.parse(value);
  return db.transaction(async tx => {
    const school = await roomSchool(tx, actor, input.programId);
    return createRoomRecord(tx, actor, school, input);
  });
}

export async function createRoomAtSite(actor: AccessContext, value: z.infer<typeof createRoomAtSiteSchema>) {
  const input = createRoomAtSiteSchema.parse(value);
  return db.transaction(async tx => {
    const [site] = await tx.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
    if (!site) throw new AuthorizationError("existing school Site");
    assertRoomCoverageManager(actor, site);
    return createRoomRecord(tx, actor, { siteId: site.id, organizationId: site.organizationId }, input);
  });
}

async function createRoomRecord(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: AccessContext,
  school: { siteId: string; organizationId: string; programId?: string },
  input: { roomId: string; name: string; capacity: number }) {
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, school.siteId)).for("update");
    const [existing] = await tx.select().from(siteRooms).where(eq(siteRooms.id, input.roomId)).limit(1);
    if (existing) {
      if (existing.siteId !== school.siteId || existing.name !== input.name || existing.capacity !== input.capacity)
        throw new DomainError("SITE_ROOM_IDENTIFIER_CONFLICT", "This room identifier was already used for different details");
      return { id: existing.id, created: false };
    }
    const [duplicate] = await tx.select({ id: siteRooms.id }).from(siteRooms).where(and(
      eq(siteRooms.siteId, school.siteId), sql`lower(btrim(${siteRooms.name})) = lower(${input.name})`,
    )).limit(1);
    if (duplicate) throw new DomainError("SITE_ROOM_NAME_CONFLICT", "A room with this name already exists at this Site. Use the saved room.");
    await tx.insert(siteRooms).values({ id: input.roomId, siteId: school.siteId,
      name: input.name, capacity: input.capacity });
    const eventId = await emitEvent(tx, { eventType: EventTypes.SiteRoomCreated,
      aggregateType: "site_room", aggregateId: input.roomId, actorPersonId: actor.actorPersonId,
      ...school, payload: { name: input.name, capacity: input.capacity } });
    await writeAudit(tx, actor, { action: "site.room.created", entityType: "site_room",
      entityId: input.roomId, scope: school, after: { name: input.name, capacity: input.capacity },
      contextExtras: { domainEventId: eventId } });
    return { id: input.roomId, created: true };
}

export async function assignSchoolSectionRoom(actor: AccessContext, value: z.infer<typeof assignSectionRoomSchema>) {
  const input = assignSectionRoomSchema.parse(value);
  return db.transaction(async tx => {
    const school = await roomSchool(tx, actor, input.programId);
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, school.siteId)).for("update");
    const [section] = await tx.select({ id: sections.id, metadata: sections.metadata })
      .from(sections).where(and(eq(sections.id, input.sectionId), eq(sections.siteId, school.siteId),
        eq(sections.programId, school.programId), eq(sections.active, true))).limit(1).for("update");
    if (!section) throw new AuthorizationError("active class belonging to this exact Site and Program");
    if (input.roomId) await requireSiteRoom(tx, school.siteId, input.roomId);
    const previous = typeof section.metadata.physicalRoomId === "string" ? section.metadata.physicalRoomId : null;
    if (previous === input.roomId) return { changed: false };
    await tx.update(sections).set({ metadata: { ...section.metadata, physicalRoomId: input.roomId },
      updatedAt: new Date() }).where(eq(sections.id, section.id));
    const scope = { ...school, sectionId: section.id };
    const eventId = await emitEvent(tx, { eventType: EventTypes.SectionRoomAssigned,
      aggregateType: "section", aggregateId: section.id, actorPersonId: actor.actorPersonId,
      ...scope, payload: { roomId: input.roomId, previousRoomId: previous } });
    await writeAudit(tx, actor, { action: "section.room.assigned", entityType: "section",
      entityId: section.id, scope, before: { roomId: previous }, after: { roomId: input.roomId },
      contextExtras: { domainEventId: eventId } });
    return { changed: true };
  });
}

export async function requireSiteRoom(tx: Reader, siteId: string, roomId: string) {
  const [room] = await tx.select({ id: siteRooms.id, name: siteRooms.name, capacity: siteRooms.capacity,
    retiredAt: siteRooms.retiredAt })
    .from(siteRooms).where(and(eq(siteRooms.id, roomId), eq(siteRooms.siteId, siteId))).limit(1).for("share");
  if (!room) throw new AuthorizationError("physical room belonging to this exact Site");
  if (room.retiredAt) throw new DomainError("SITE_ROOM_RETIRED");
  return room;
}

export async function updateSchoolRoom(actor: AccessContext, value: z.infer<typeof updateSiteRoomSchema>) {
  const input = updateSiteRoomSchema.parse(value);
  return db.transaction(async tx => {
    const school = await roomSchool(tx, actor, input.programId);
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, school.siteId)).for("update");
    const [room] = await tx.select().from(siteRooms).where(and(
      eq(siteRooms.id, input.roomId), eq(siteRooms.siteId, school.siteId))).limit(1).for("update");
    if (!room) throw new AuthorizationError("physical room belonging to this exact Site");
    if (room.retiredAt) throw new DomainError("SITE_ROOM_RETIRED");
    if (room.name === input.name && room.capacity === input.capacity) return { changed: false };
    if (room.revision !== input.expectedRevision) throw new DomainError("CONFLICT", "Room changed since it was loaded");
    const [duplicate] = await tx.select({ id: siteRooms.id }).from(siteRooms).where(and(
      eq(siteRooms.siteId, school.siteId), ne(siteRooms.id, room.id),
      sql`lower(btrim(${siteRooms.name})) = lower(${input.name})`,
    )).limit(1);
    if (duplicate) throw new DomainError("SITE_ROOM_NAME_CONFLICT");
    const after = { name: input.name, capacity: input.capacity, revision: room.revision + 1 };
    await tx.update(siteRooms).set(after).where(eq(siteRooms.id, room.id));
    const eventId = await emitEvent(tx, { eventType: EventTypes.SiteRoomUpdated,
      aggregateType: "site_room", aggregateId: room.id, actorPersonId: actor.actorPersonId,
      ...school, payload: { ...after, reason: input.reason } });
    await writeAudit(tx, actor, { action: "site.room.updated", entityType: "site_room",
      entityId: room.id, scope: school, before: { name: room.name, capacity: room.capacity, revision: room.revision },
      after, contextExtras: { reason: input.reason, domainEventId: eventId } });
    return { changed: true };
  });
}

export async function retireSchoolRoom(actor: AccessContext, value: z.infer<typeof retireSiteRoomSchema>) {
  const input = retireSiteRoomSchema.parse(value);
  return db.transaction(async tx => {
    const school = await roomSchool(tx, actor, input.programId);
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, school.siteId)).for("update");
    const [room] = await tx.select().from(siteRooms).where(and(
      eq(siteRooms.id, input.roomId), eq(siteRooms.siteId, school.siteId))).limit(1).for("update");
    if (!room) throw new AuthorizationError("physical room belonging to this exact Site");
    if (room.retiredAt) return { changed: false };
    if (room.revision !== input.expectedRevision) throw new DomainError("CONFLICT", "Room changed since it was loaded");
    const retiredAt = new Date();
    await tx.update(siteRooms).set({ retiredAt, revision: room.revision + 1 }).where(eq(siteRooms.id, room.id));
    const after = { retiredAt: retiredAt.toISOString(), revision: room.revision + 1 };
    const eventId = await emitEvent(tx, { eventType: EventTypes.SiteRoomRetired,
      aggregateType: "site_room", aggregateId: room.id, actorPersonId: actor.actorPersonId,
      ...school, payload: { ...after, reason: input.reason } });
    await writeAudit(tx, actor, { action: "site.room.retired", entityType: "site_room",
      entityId: room.id, scope: school, before: { retiredAt: null, revision: room.revision },
      after, contextExtras: { reason: input.reason, domainEventId: eventId } });
    return { changed: true };
  });
}
