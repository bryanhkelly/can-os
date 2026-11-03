import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  order: [] as string[],
  insert: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
    execute: async () => { state.order.push("lock"); },
    select: () => {
      state.order.push("lookup");
      return { from() { return this; }, where() { return this; },
        limit: async () => state.existing ? [state.existing] : [] };
    },
    insert: () => ({
      values: (value: unknown) => {
        state.insert(value);
        return { returning: async () => [{ id: "00000000-0000-4000-8000-000000000001" }] };
      },
    }),
  }) },
}));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.event }));

import { createConferenceSeries } from "@/modules/conferences/conference-service";

const context: CommandContext = {
  actorPersonId: "teacher-1", capabilities: new Set(["conference.manage"]), scope: { siteIds: ["site-1"] },
};
const input = {
  seriesId: "00000000-0000-4000-8000-000000000001",
  siteId: "site-1", teacherPersonId: "teacher-1", title: "Office hours",
  startsAt: new Date("2027-01-01T10:00:00Z"), endsAt: new Date("2027-01-01T11:00:00Z"), slotMinutes: 20,
};
const saved = { ...input, id: input.seriesId, sectionId: null,
  metadata: { creationActorPersonId: context.actorPersonId } };

beforeEach(() => {
  vi.clearAllMocks();
  state.existing = null;
  state.order = [];
});

describe("conference series request identity", () => {
  it("locks before looking up the identity and creates one series with its slots and evidence", async () => {
    await expect(createConferenceSeries(context, input)).resolves.toBe(input.seriesId);
    expect(state.order).toEqual(["lock", "lookup"]);
    expect(state.insert).toHaveBeenCalledTimes(2);
    expect(state.insert.mock.calls[0][0]).toMatchObject({
      id: input.seriesId, metadata: { creationActorPersonId: "teacher-1" },
    });
    expect(state.insert.mock.calls[1][0]).toHaveLength(3);
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
  });

  it("replays the exact request without inserting slots or duplicating evidence", async () => {
    state.existing = saved;
    await expect(createConferenceSeries(context, input)).resolves.toBe(input.seriesId);
    expect(state.order).toEqual(["lock", "lookup"]);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });

  it("uses the same normalized UUID for the lookup and lock across UUID casing", async () => {
    const seriesId = "a1000000-0000-4000-8000-000000000001";
    state.existing = { ...saved, id: seriesId };
    await expect(createConferenceSeries(context, { ...input, seriesId: seriesId.toUpperCase() }))
      .resolves.toBe(seriesId);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("rejects malformed request identifiers before opening a transaction", async () => {
    await expect(createConferenceSeries(context, { ...input, seriesId: "" }))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(state.order).toEqual([]);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it.each([
    { siteId: "other-site" }, { sectionId: "other-section" }, { teacherPersonId: "other-teacher" },
    { title: "Changed title" }, { slotMinutes: 30 }, { metadata: { creationActorPersonId: "other-actor" } },
    { startsAt: new Date("2027-01-01T10:20:00Z") }, { endsAt: new Date("2027-01-01T12:00:00Z") },
  ])("rejects conflicting identity reuse without writes", change => {
    state.existing = { ...saved, ...change };
    return expect(createConferenceSeries(context, input)).rejects.toMatchObject({ code: "CONFLICT" })
      .then(() => {
        expect(state.insert).not.toHaveBeenCalled();
        expect(state.audit).not.toHaveBeenCalled();
        expect(state.event).not.toHaveBeenCalled();
      });
  });

  it("preserves callers that do not provide a request identity", async () => {
    await createConferenceSeries(context, { ...input, seriesId: undefined });
    expect(state.order).toEqual([]);
    expect(state.insert.mock.calls[0][0]).not.toHaveProperty("id");
    expect(state.audit).toHaveBeenCalledOnce();
  });
});
