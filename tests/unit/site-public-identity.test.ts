import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccessContext, type AccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][], update: vi.fn(), audit: vi.fn(), event: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const tx = {
    select: () => {
      const rows = state.rows.shift() ?? [];
      const query = {
        from: () => query, innerJoin: () => query, where: () => query,
        for: () => query, limit: async () => rows,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    execute: vi.fn(),
    update: (table: unknown) => ({
      set: (value: unknown) => ({ where: async () => { state.update(table, value); } }),
    }),
  };
  return { db: { select: tx.select, transaction: async (run: (value: typeof tx) => unknown) => run(tx) } };
});
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.event }));
import { changeSitePublicIdentity } from "@/modules/sites/site-publication.server";

const revision = "2026-11-03T00:00:00.000Z";
const actor = resolveAccessContext({ accountId: "account", sessionId: "session", activeGrantId: "grant" }, [{
  id: "grant", accountId: "account", personId: "admin", role: "site_admin",
  organizationId: "org", siteId: "site", active: true,
}]);
const input = {
  siteId: "site", name: "Valor School", slug: "valorschool", expectedName: "Previous School",
  expectedRevision: revision, reason: "Reviewed the canonical school name and new address.", contentReviewed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [
    [{ id: "site", organizationId: "org" }], [{ id: "publisher" }],
    [{ id: "site", organizationId: "org", name: "Previous School", slug: "previous-school" }],
    [{ siteId: "site", slug: "previous-school", status: "published", updatedAt: new Date(revision) }],
    [], [],
  ];
});

describe("reviewed canonical school name and public address", () => {
  it("keeps tenant identity and publication status and writes transactional evidence", async () => {
    await expect(changeSitePublicIdentity(actor, input)).resolves.toMatchObject({ changed: true, siteId: "site" });
    expect(state.update.mock.calls.map(call => call[1])).toEqual([
      { name: "Valor School", slug: "valorschool", updatedAt: expect.any(Date) },
      { slug: "valorschool", updatedAt: expect.any(Date) },
    ]);
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({
      action: "site.public_identity.change",
      before: { name: "Previous School", siteSlug: "previous-school", publicSlug: "previous-school" },
    }));
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "SitePublicIdentityChanged",
      payload: expect.objectContaining({ status: "published", slug: "valorschool" }),
    }));
  });
  it("does not grant registrar identity-management authority", async () => {
    const registrar: AccessContext = { ...actor, role: "registrar" };
    await expect(changeSitePublicIdentity(registrar, input)).rejects.toThrow("Site Admin");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("requires the explicit institutional publisher assignment", async () => {
    state.rows[1] = [];
    await expect(changeSitePublicIdentity(actor, input)).rejects.toThrow("explicit site publication");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("rejects foreign tenant scope", async () => {
    await expect(changeSitePublicIdentity({ ...actor, scope: { organizationIds: ["foreign"], siteIds: ["foreign"] } }, input))
      .rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each([
    { contentReviewed: false }, { name: "" }, { slug: "admin" }, { reason: "short" },
    { expectedRevision: "2020-01-01T00:00:00.000Z" }, { expectedName: "Stale name" },
  ])("rejects invalid or stale decisions without writes (%j)", async change => {
    await expect(changeSitePublicIdentity(actor, { ...input, ...change })).rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled();
  });
  it("refuses an occupied public address", async () => {
    state.rows[4] = [{ siteId: "other-site" }];
    await expect(changeSitePublicIdentity(actor, input)).rejects.toThrow("already reserved");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("accepts identical retries without duplicate audit or events", async () => {
    state.rows[2] = [{ id: "site", organizationId: "org", name: input.name, slug: input.slug }];
    state.rows[3] = [{ slug: input.slug }];
    await expect(changeSitePublicIdentity(actor, input)).resolves.toMatchObject({ changed: false });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
});
