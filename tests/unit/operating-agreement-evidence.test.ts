import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { listOperatingAgreementEvidence } from "@/modules/programs/program-site-authorization.server";
import { documents } from "@/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  reads: [] as Array<{ table: unknown; fields: unknown; predicate?: unknown; limit?: number }>,
}));
vi.mock("@/db/client", () => ({ db: {
  select: (fields: unknown) => {
    const read = { fields } as typeof state.reads[number];
    return {
      from(table: unknown) { read.table = table; state.reads.push(read); return this; },
      where(predicate: unknown) { read.predicate = predicate; return this; },
      orderBy() { return this; },
      async limit(limit: number) { read.limit = limit; return state.rows.shift() ?? []; },
    };
  },
} }));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));

const actor: AccessContext = {
  actorPersonId: "reviewer", accountId: "account", sessionId: "session",
  grantId: "grant", grantSiteId: null, role: "can_network_steward",
  capabilities: new Set(["network.agreements.verify"]),
  scope: { organizationIds: ["can"], siteIds: [], programIds: [] },
};
const input = { authorizationId: "request", effectiveThrough: new Date("2030-01-01") };
const request = {
  programId: "program", siteId: "site", hostOrganizationId: "church",
  institutionOrganizationId: "can", requestedByPersonId: "requester",
  services: ["academic_instruction"], status: "requested",
};
const document = {
  id: "document", fileName: "Signed agreement.pdf", subjectType: "program",
  subjectId: "program", category: "program_site_operating_agreement",
  verifiedAt: new Date("2026-01-01"), verifiedByPersonId: "verifier",
  expiresAt: new Date("2031-01-01"),
  metadata: { hostOrganizationId: "church", institutionOrganizationId: "can",
    siteId: "site", hostSignatureVerified: true, institutionSignatureVerified: true,
    authorizedServices: ["academic_instruction"] },
};
function arrange(overrides = {}, docs = [document]) {
  state.rows = [
    [{ ...request, ...overrides }],
    [{ id: "program", organizationId: "church", siteId: "site",
      hostOrganizationId: "church", institutionOrganizationId: "can",
      creditIssuingOrganizationId: null }],
    [{ organizationId: "church" }], [{ type: "church" }],
    [{ type: "can_network" }], docs,
  ];
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25"));
  state.reads = []; arrange();
});
import { afterEach } from "vitest";
afterEach(() => vi.useRealTimers());
function expectNoDocumentRead() {
  expect(state.reads.some(read => read.table === documents)).toBe(false);
}
describe("operating agreement evidence metadata", () => {
  it("returns only minimal eligible metadata and constrains the document query", async () => {
    expect(await listOperatingAgreementEvidence(actor, input)).toEqual({
      candidates: [{ id: "document", fileName: "Signed agreement.pdf",
        verifiedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z" }],
      truncated: false,
    });
    const read = state.reads.find(read => read.table === documents)!;
    const query = new PgDialect().sqlToQuery(read.predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["program", "program", "program_site_operating_agreement"]);
    expect(read.limit).toBe(101);
    expect(Object.keys(read.fields as object)).not.toContain("storageKey");
  });
  it.each([
    { scope: { organizationIds: ["other-can"] } },
    { role: "registrar" }, { grantSiteId: "site" },
    { capabilities: new Set() }, { demoFacilitator: true },
    { actorPersonId: "requester" },
  ])("denies an unauthorized reviewer before reading documents: %j", async patch => {
    await expect(listOperatingAgreementEvidence({ ...actor, ...patch } as AccessContext, input)).rejects.toThrow();
    expectNoDocumentRead();
  });
  it.each([{ siteId: "other" }, { hostOrganizationId: "other" },
    { institutionOrganizationId: "other" }, { status: "suspended" },
    { status: "denied" }, { status: "revoked" }])(
    "denies changed parties or ineligible lifecycle states: %j", async patch => {
      arrange(patch);
      await expect(listOperatingAgreementEvidence(actor, input)).rejects.toThrow();
      expectNoDocumentRead();
    });
  it("filters wrong scope, expired, self-verified, unsigned and insufficient-service evidence", async () => {
    arrange({}, [
      document,
      { ...document, subjectId: "other-program" },
      { ...document, verifiedByPersonId: "reviewer" },
      { ...document, verifiedByPersonId: "requester" },
      { ...document, expiresAt: new Date("2029-01-01") },
      { ...document, verifiedAt: new Date("2031-01-01") },
      { ...document, metadata: { ...document.metadata, hostSignatureVerified: false } },
      { ...document, metadata: { ...document.metadata, authorizedServices: [] } },
    ]);
    expect((await listOperatingAgreementEvidence(actor, input)).candidates).toHaveLength(1);
  });
  it("reports a bounded scan rather than claiming all documents were checked", async () => {
    arrange({}, Array.from({ length: 101 }, (_, i) => ({ ...document, id: String(i) })));
    const result = await listOperatingAgreementEvidence(actor, input);
    expect(result.candidates).toHaveLength(100); expect(result.truncated).toBe(true);
  });
  it("rejects invalid or expired end dates before reads", async () => {
    for (const effectiveThrough of [new Date("invalid"), new Date("2025-01-01")])
      await expect(listOperatingAgreementEvidence(actor, { ...input, effectiveThrough })).rejects.toThrow();
    expect(state.reads).toHaveLength(0);
  });
  it("offers verified evidence for a live approved renewal only beyond its current window", async () => {
    arrange({ status: "approved", effectiveThrough: new Date("2029-01-01") });
    expect((await listOperatingAgreementEvidence(actor, input)).candidates)
      .toEqual([expect.objectContaining({ id: "document" })]);
  });
  it("offers renewal evidence for a lapsed approved agreement", async () => {
    arrange({ status: "approved", effectiveThrough: new Date("2025-01-01") });
    expect((await listOperatingAgreementEvidence(actor, input)).candidates).toHaveLength(1);
  });
  it("rejects a non-extending renewal before reading documents", async () => {
    arrange({ status: "approved", effectiveThrough: input.effectiveThrough });
    await expect(listOperatingAgreementEvidence(actor, input)).rejects.toThrow("extends the current agreement window");
    expectNoDocumentRead();
  });

});
