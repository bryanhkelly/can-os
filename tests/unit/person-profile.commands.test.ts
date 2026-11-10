import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  actor: null as AccessContext | null,
  rows: [] as unknown[][],
  retired: [] as { id: string }[],
  filters: [] as unknown[],
  audit: vi.fn(), event: vi.fn(), sign: vi.fn(), update: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost"), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => state.actor }));
vi.mock("@/modules/identity/actors.server", () => ({ recordAudit: state.audit }));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.event }));
vi.mock("@/platform/storage/r2", () => ({
  signPrivateObjectUrl: state.sign, createPrivateUpload: vi.fn(), verifyPrivateObject: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const db = {
    select: () => {
      const rows = state.rows.shift() ?? [];
      const query = {
        from: () => query, innerJoin: () => query, where: () => query,
        limit: () => Promise.resolve(rows), orderBy: () => query,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    transaction: async (run: (tx: unknown) => unknown) => run(db),
    execute: vi.fn(),
    update: () => ({ set: (values: unknown) => {
      state.update(values);
      return { where: (filter: unknown) => {
        state.filters.push(filter);
        return { returning: async () => state.retired };
      } };
    } }),
  };
  return { db };
});

import { getPersonProfile, getProfilePhoto, removeProfilePhoto } from "@/modules/profiles/person-profile.functions";

const self = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const section = "33333333-3333-4333-8333-333333333333";
function viewer(role: string) {
  state.actor = { actorPersonId: self, accountId: self, sessionId: self, grantId: self, grantSiteId: self,
    role, scope: { siteIds: [self], programIds: [section] }, capabilities: new Set(roleCapabilities[role]) };
}
function person(id = self) { return { id, firstName: "Alex", lastName: "Example", preferredName: null }; }

beforeEach(() => {
  vi.clearAllMocks(); state.rows = []; state.retired = []; state.filters = [];
  viewer("teacher");
});

describe("person profile command boundaries", () => {
  it.each(Object.keys(roleCapabilities))("opens the verified %s member's own identity", async role => {
    viewer(role); state.rows = [[person()], [], []];
    const profile = await getPersonProfile({ data: {} });
    expect(profile.isSelf).toBe(true);
    expect(profile.modules.photo).toBe(true);
    expect(profile.personId).toBe(self);
  });
  it("denies unknown memberships before querying a person", async () => {
    viewer("unknown");
    await expect(getPersonProfile({ data: {} })).rejects.toThrow("active profile membership");
  });
  it("does not give a network role cross-person academic profile access", async () => {
    viewer("network_admin"); state.rows = [[person(other)], [], []];
    await expect(getPersonProfile({ data: { personId: other } })).rejects.toThrow("profile viewer authority");
  });
  it("does not sign a photo for a teacher without a target relationship", async () => {
    state.rows = [[person(other)], [], [{ id: section, title: "English" }], [], []];
    await expect(getProfilePhoto({ data: { personId: other } })).rejects.toThrow("current profile relationship");
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("returns only shared teaching assignments to a student", async () => {
    viewer("student");
    state.rows = [[person(other)], [{ id: section, title: "English" }, { id: other, title: "Unrelated" }], [], [{ sectionId: section }]];
    const profile = await getPersonProfile({ data: { personId: other } });
    expect(profile.sections).toEqual([{ id: section, title: "English" }]);
    expect(Object.values(profile.modules)).not.toContain(true);
  });
  it("denies a student's access to guardian portraits", async () => {
    viewer("student"); state.rows = [[person(other)], [], [], [{ sectionId: section }]];
    await expect(getProfilePhoto({ data: { personId: other } })).rejects.toThrow("current profile relationship");
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("allows staff to read a guardian only through the scoped relationship query", async () => {
    state.rows = [[person(other)], [], [], [{ id: section, title: "English" }]];
    const profile = await getPersonProfile({ data: { personId: other } });
    expect(profile.kind).toBe("Guardian");
    expect(profile.modules.photo).toBe(false);
  });
  it("retires only the signed-in person's photos and emits audit plus event", async () => {
    state.rows = [[person()], [], []]; state.retired = [{ id: other }, { id: section }];
    await expect(removeProfilePhoto()).resolves.toEqual({ removed: true });
    const predicate = new PgDialect().sqlToQuery(state.filters[0] as SQL);
    expect(predicate.params).toContain(self);
    expect(predicate.params).toContain("profile_photo");
    expect(state.update).toHaveBeenCalledWith({ expiresAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), state.actor, expect.objectContaining({ action: "profile.photo_removed", resourceId: self }));
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ aggregateId: self, payload: { removed: true, documentIds: [other, section] } }));
  });
  it("makes repeat removal a no-op without duplicate events", async () => {
    state.rows = [[person()], [], []];
    await expect(removeProfilePhoto()).resolves.toEqual({ removed: false });
    expect(state.audit).not.toHaveBeenCalled(); expect(state.event).not.toHaveBeenCalled();
  });
  it("does not sign a storage key belonging to another person", async () => {
    state.rows = [[person()], [], [], [{ key: `profiles/${other}/${section}`, mimeType: "image/jpeg" }]];
    await expect(getProfilePhoto({ data: {} })).rejects.toThrow("invalid storage contract");
    expect(state.sign).not.toHaveBeenCalled();
  });
});