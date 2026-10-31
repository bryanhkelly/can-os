import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AccessContext } from "@/domain/access-context";
import { respondToOnsiteDuty } from "@/modules/operations/onsite-duty-response.functions";

const state = vi.hoisted(() => ({
  actor: undefined as AccessContext | undefined,
  rows: [] as unknown[][],
  predicates: [] as unknown[],
  inserts: [] as Record<string, unknown>[],
  update: vi.fn(),
  director: "director" as string | null,
  block: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(fn: (value: { data: unknown }) => unknown) {
      return async (value: { data: unknown }) => fn({ data: this.parse(value.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"), setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => state.actor }));
vi.mock("@/modules/operations/onsite-supervision.functions", () => ({
  getOnsiteSupervisionPlan: async () => ({ siteId: "site", projectionTruncated: false, blocks: [state.block] }),
  loadOnsiteSupervisionPlanForActor: vi.fn(),
}));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({ requireChurchHostedOperatingServices: vi.fn() }));
vi.mock("@/modules/operations/site-local-delegation.server", () => ({
  currentSiteDirectorPersonId: async () => state.director, requireCurrentSiteLocalDelegate: vi.fn(),
}));
vi.mock("@/modules/operations/site-section-facilitators.server", () => ({ requireCurrentSectionFacilitator: vi.fn() }));
vi.mock("@/modules/operations/onsite-block-safety.server", () => ({ requireCurrentOnsiteAdultSafety: vi.fn() }));
vi.mock("@/platform/mutation", () => ({
  writeAudit: vi.fn(), emitEvent: async () => "event", notifyMany: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const tx = {
    execute: vi.fn(),
    select: () => ({
      from() { return this; },
      where(predicate: unknown) { state.predicates.push(predicate); return this; },
      orderBy() { return this; },
      async limit() { return state.rows.shift() ?? []; },
    }),
    insert: () => ({ values(value: Record<string, unknown>) {
      state.inserts.push(value);
      return { returning: async () => [{ id: state.inserts.length === 1 ? "response" : "gap" }] };
    } }),
    update: state.update,
  };
  return { db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [
      { id: "site", organizationId: "church", timezone: "UTC" },
    ] }) }) }),
    transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
  } };
});
const sectionId = "00000000-0000-4000-8000-000000000001";
const periodA = "00000000-0000-4000-8000-000000000002";
const periodB = "00000000-0000-4000-8000-000000000003";
const date = () => new Date().toISOString().slice(0, 10);
beforeEach(() => {
  vi.clearAllMocks(); state.rows = []; state.predicates = []; state.inserts = []; state.director = "director";
  state.actor = {
    actorPersonId: "adult", accountId: "account", sessionId: "session", grantId: "grant",
    grantSiteId: "site", role: "room_facilitator", capabilities: new Set(["onsite.attendance.record"]),
    scope: { organizationIds: ["church"], siteIds: ["site"], programIds: ["program"] },
  };
  state.block = { sectionId, periodId: periodA, programId: "program", planToken: "current-plan",
    canRespond: true, canAccept: true, startsAtLocal: "09:00", endsAtLocal: "10:00" };
});
describe("scheduled-block coverage gap Actions", () => {
  it.each([periodA, periodB])("scopes gap lookup and creation to period %s and current plan", async periodId => {
    state.block.periodId = periodId;
    const result = await respondToOnsiteDuty({ data: {
      date: date(), sectionId, periodId, response: "cannot_cover", reason: "unavailable", confirmed: true,
    } });
    expect(result).toMatchObject({ coverageGapActionId: "gap" });
    const query = new PgDialect().sqlToQuery(state.predicates[1] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual([
      "onsite_coverage_gap", "open", "site", "program", sectionId, date(), periodId, "current-plan",
    ]);
    expect(state.inserts[1]).toMatchObject({
      ownerPersonId: "director", siteId: "site", programId: "program", sectionId,
      metadata: { date: date(), periodId, planToken: "current-plan", responseId: "response" },
    });
  });
  it("reuses only a gap found under the exact current block predicate", async () => {
    state.rows = [[], [{ id: "existing-gap" }]];
    expect(await respondToOnsiteDuty({ data: {
      date: date(), sectionId, periodId: periodA, response: "cannot_cover", reason: "unavailable", confirmed: true,
    } })).toMatchObject({ coverageGapActionId: "existing-gap" });
    expect(state.inserts).toHaveLength(1);
  });
  it("does not resolve coverage-gap Actions when one adult accepts a duty", async () => {
    await respondToOnsiteDuty({ data: {
      date: date(), sectionId, periodId: periodA, response: "accepted", confirmed: true,
    } });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.predicates).toHaveLength(1); // prior duty response only
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      type: "onsite_instruction_duty_response", metadata: { scope: "staff_availability_only" },
    });
  });
  it("keeps an urgent explicit escalation open if no eligible director exists", async () => {
    state.director = null;
    await respondToOnsiteDuty({ data: {
      date: date(), sectionId, periodId: periodA, response: "cannot_cover", reason: "unavailable", confirmed: true,
    } });
    expect(state.inserts[1]).toMatchObject({status:"open",priority:"urgent",ownerPersonId:null,
      metadata:{ownerEscalation:true}});
    expect(state.inserts[1].title).toContain("Unassigned coverage escalation");
    expect(state.inserts[1].description).toContain("host registrar must appoint");
    expect(state.update).not.toHaveBeenCalled();
  });

});

it("scopes duty retry identity to the actual responding adult",async()=>{
  state.rows=[[]];
  await respondToOnsiteDuty({data:{date:date(),sectionId,periodId:periodA,response:"accepted",confirmed:true}});
  const query=new PgDialect().sqlToQuery(state.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
  expect(query.sql).toContain('"actions"."owner_person_id"');
  expect(query.params).toContain(state.actor!.actorPersonId);
});
