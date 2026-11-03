import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { assertSiteRoomReader, assertSiteRoomManager, createSiteRoomSchema, retireSiteRoomSchema, updateSiteRoomSchema } from "@/domain/site-rooms";
import { assignSchoolSectionRoom, createSchoolRoom, getSchoolRooms, requireSiteRoom, retireSchoolRoom, updateSchoolRoom } from "@/modules/operations/site-rooms.server";
import { db } from "@/db/client";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], insert: vi.fn(), update: vi.fn(), audit: vi.fn(), event: vi.fn() }));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.event }));
vi.mock("@/db/client", () => {
  const tx = {
    select: () => ({ from() { return this; }, innerJoin() { return this; }, where() { return this; },
      for() { return this; }, orderBy() { return this; }, limit() { return this; },
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(state.rows.shift() ?? []).then(resolve); },
    }),
    insert: () => ({ values: state.insert }),
    update: () => ({ set(value: unknown) { state.update(value); return { where: async () => {} }; } }),
  };
  return { db: { ...tx, transaction: async (run: (tx: unknown) => unknown) => run(tx) } };
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const school = { programId: id(1), siteId: id(2), organizationId: id(3) };
const actor = { actorPersonId: id(4), role: "registrar", grantSiteId: school.siteId,
  capabilities: new Set(["program.launch.start"]),
  scope: { organizationIds: [school.organizationId], siteIds: [school.siteId], programIds: [school.programId] },
} as AccessContext;
const input = { programId: school.programId, roomId: id(5), name: "Classroom A", capacity: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [[school], [{ id: school.siteId }], [], []];
  state.event.mockResolvedValue("event");
});

describe("Site-owned physical classrooms", () => {
  it("trims names and rejects invalid occupancy limits", () => {
    expect(createSiteRoomSchema.parse({ ...input, name: " Classroom A " }).name).toBe("Classroom A");
    for (const capacity of [0, -1, 1001, 2.5])
      expect(createSiteRoomSchema.safeParse({ ...input, capacity }).success).toBe(false);
  });
  it.each(["registrar", "site_admin"])("allows a scoped %s to configure school rooms", role => {
    expect(() => assertSiteRoomManager({ ...actor, role }, school)).not.toThrow();
  });
  it.each([
    { ...actor, role: "teacher" },
    { ...actor, grantSiteId: id(9) },
    { ...actor, scope: { ...actor.scope, programIds: [] } },
    { ...actor, scope: { ...actor.scope, siteIds: [id(9)] } },
    { ...actor, scope: { ...actor.scope, organizationIds: [id(9)] } },
    { ...actor, capabilities: new Set<string>() },
  ])("denies missing role, capability or exact resource scope", value => {
    expect(() => assertSiteRoomManager(value, school)).toThrow();
  });
  it("allows a scoped church leader to read rooms without granting room mutations", async () => {
    const leader={...actor,role:"site_leader",capabilities:new Set<string>()};
    expect(()=>assertSiteRoomReader(leader,school)).not.toThrow();
    expect(()=>assertSiteRoomManager(leader,school)).toThrow();
    state.rows=[[school],[],[{id:input.roomId,name:input.name,capacity:20,revision:1,retiredAt:null}]];
    const directory=await getSchoolRooms(leader,{programId:school.programId});
    expect(directory.canManage).toBe(false);
    expect(directory.rooms).toHaveLength(1);
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("rejects foreign or missing program scope in the read-only room directory",()=>{
    expect(()=>assertSiteRoomReader({...actor,role:"site_leader",scope:{...actor.scope,siteIds:[id(9)]}},school)).toThrow();
    expect(()=>assertSiteRoomReader({...actor,role:"teacher"},school)).toThrow();
  });
  it("creates a room with atomic audit and domain event, not an opening approval", async () => {
    expect(await createSchoolRoom(actor, input)).toEqual({ id: input.roomId, created: true });
    expect(state.insert).toHaveBeenCalledWith({ id: input.roomId, siteId: school.siteId,
      name: input.name, capacity: input.capacity });
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "SiteRoomCreated" }));
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), actor,
      expect.objectContaining({ action: "site.room.created" }));
  });
  it("replays the same room identifier without duplicate audit or events", async () => {
    state.rows[2] = [{ ...input, id: input.roomId, siteId: school.siteId }];
    expect(await createSchoolRoom(actor, input)).toEqual({ id: input.roomId, created: false });
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("rejects reused identifiers with different details", async () => {
    state.rows[2] = [{ id: input.roomId, siteId: school.siteId, name: "Other", capacity: 20 }];
    await expect(createSchoolRoom(actor, input)).rejects.toThrow("different details");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects duplicate room names instead of silently adopting another room", async () => {
    state.rows[3] = [{ id: id(9) }];
    await expect(createSchoolRoom(actor, input)).rejects.toThrow("already exists");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("does not resolve an unknown or other-Site room for a plan", async () => {
    state.rows = [[]];
    await expect(requireSiteRoom(db, school.siteId, id(9))).rejects.toThrow("this exact Site");
  });
  it("assigns a canonical physical room without changing other class metadata", async () => {
    state.rows = [[school], [{ id: school.siteId }], [{ id: id(6), metadata: { retained: true } }],
      [{ id: input.roomId, name: input.name, capacity: input.capacity }]];
    await expect(assignSchoolSectionRoom(actor, { programId: school.programId,
      sectionId: id(6), roomId: input.roomId })).resolves.toEqual({ changed: true });
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { retained: true, physicalRoomId: input.roomId },
    }));
    expect(state.event).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ eventType: "SectionRoomAssigned" }));
  });
  it("rejects class assignments to rooms outside the Site", async () => {
    state.rows = [[school], [{ id: school.siteId }], [{ id: id(6), metadata: {} }], []];
    await expect(assignSchoolSectionRoom(actor, { programId: school.programId,
      sectionId: id(6), roomId: id(9) })).rejects.toThrow("this exact Site");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("replays the same classroom assignment without another event", async () => {
    state.rows = [[school], [{ id: school.siteId }], [{ id: id(6), metadata: { physicalRoomId: input.roomId } }],
      [{ id: input.roomId, name: input.name, capacity: input.capacity }]];
    expect(await assignSchoolSectionRoom(actor, { programId: school.programId,
      sectionId: id(6), roomId: input.roomId })).toEqual({ changed: false });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
});

const room = { id: input.roomId, siteId: school.siteId, name: input.name, capacity: input.capacity,
  revision: 1, retiredAt: null };
const change = { ...input, name: "Updated Classroom", capacity: 18, expectedRevision: 1, reason: "Reviewed new occupancy limit." };
const retirement = { programId: school.programId, roomId: input.roomId, expectedRevision: 1,
  reason: "Classroom no longer used for new plans.", confirmed: true as const };
describe("physical classroom lifecycle", () => {
  beforeEach(() => { state.rows = [[school], [{ id: school.siteId }], [room], []]; });
  it("requires a revision, meaningful rationale and explicit retirement confirmation", () => {
    expect(updateSiteRoomSchema.safeParse({ ...change, expectedRevision: 0 }).success).toBe(false);
    expect(updateSiteRoomSchema.safeParse({ ...change, reason: "" }).success).toBe(false);
    expect(retireSiteRoomSchema.safeParse({ ...retirement, confirmed: false }).success).toBe(false);
  });
  it("updates room details with audit and event without touching Sections or documents", async () => {
    expect(await updateSchoolRoom(actor, change)).toEqual({ changed: true });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ name: change.name, capacity: change.capacity, revision: 2 });
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "SiteRoomUpdated" }));
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({
      before: { name: room.name, capacity: room.capacity, revision: 1 },
      contextExtras: expect.objectContaining({ reason: change.reason }),
    }));
  });
  it("does not duplicate evidence when an edit is retried after a lost response", async () => {
    state.rows[2] = [{ ...room, name: change.name, capacity: change.capacity, revision: 2 }];
    expect(await updateSchoolRoom(actor, change)).toEqual({ changed: false });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
  it.each(["edit", "retire"])("rejects stale %s requests rather than overwriting another operator", async operation => {
    state.rows[2] = [{ ...room, revision: 2 }];
    await expect(operation === "edit" ? updateSchoolRoom(actor, change) : retireSchoolRoom(actor, retirement))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.update).not.toHaveBeenCalled();
  });
  it("reserves names across active and retired rooms", async () => {
    state.rows[3] = [{ id: id(9) }];
    await expect(updateSchoolRoom(actor, change)).rejects.toMatchObject({ code: "SITE_ROOM_NAME_CONFLICT" });
    expect(state.update).not.toHaveBeenCalled();
  });
  it("retires without deleting defaults or rewriting reviewed coverage plans", async () => {
    expect(await retireSchoolRoom(actor, retirement)).toEqual({ changed: true });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ retiredAt: expect.any(Date), revision: 2 });
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "SiteRoomRetired" }));
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({
      action: "site.room.retired", contextExtras: expect.objectContaining({ reason: retirement.reason }),
    }));
  });
  it("replays retirement without another event", async () => {
    state.rows[2] = [{ ...room, retiredAt: new Date(), revision: 2 }];
    expect(await retireSchoolRoom(actor, retirement)).toEqual({ changed: false });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it.each(["edit", "select"])("rejects a retired room for %s", async operation => {
    const retired = { ...room, retiredAt: new Date() };
    if (operation === "edit") state.rows[2] = [retired];
    else state.rows = [[retired]];
    await expect(operation === "edit" ? updateSchoolRoom(actor, change) : requireSiteRoom(db, school.siteId, room.id))
      .rejects.toMatchObject({ code: "SITE_ROOM_RETIRED" });
  });
  it.each(["edit", "retire"])("rejects an unknown or other-Site room for %s", async operation => {
    state.rows[2] = [];
    await expect(operation === "edit" ? updateSchoolRoom(actor, change) : retireSchoolRoom(actor, retirement))
      .rejects.toThrow("this exact Site");
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each(["edit", "retire"])("preserves manager authorization for %s", async operation => {
    const teacher = { ...actor, role: "teacher" };
    await expect(operation === "edit" ? updateSchoolRoom(teacher, change) : retireSchoolRoom(teacher, retirement))
      .rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled();
  });
});
