import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ context: null as AccessContext | null,
  tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Affiliation tests must stay in rollback transaction");
    return state.tx;
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost") }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.context,
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("denomination HQ affiliation — actual server handlers", () => {
  it("requests, denies cross-network review, approves, withdraws and preserves school ownership", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-site-affiliation");
    let checked = false;
    let affiliationId = "";
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        const schema = await import("@/db/schema");
        const { eq, and } = await import("drizzle-orm");
        const { resolveAccessContext } = await import("@/domain/access-context");
        const endpoints = await import("@/modules/networks/network-affiliations.functions");
        const suffix = crypto.randomUUID().slice(0, 8);
        const [denom, outsider, school] = await Promise.all([
          tx.insert(schema.organizations).values({ name: "Demo HQ " + suffix,
            slug: "demo-hq-" + suffix, type: "denomination" }).returning(),
          tx.insert(schema.organizations).values({ name: "Outside HQ " + suffix,
            slug: "outside-hq-" + suffix, type: "denomination" }).returning(),
          tx.insert(schema.organizations).values({ name: "School " + suffix,
            slug: "school-" + suffix, type: "christian_school" }).returning(),
        ]).then(rows => rows.map(row => row[0]!));
        const [site] = await tx.insert(schema.sites).values({
          organizationId: school.id, name: "High School", slug: "school-" + suffix,
          timezone: "America/Los_Angeles",
        }).returning();
        const [registrar, reviewer] = await Promise.all([
          tx.insert(schema.people).values({ legalFirstName: "School", legalLastName: "Administrator" }).returning(),
          tx.insert(schema.people).values({ legalFirstName: "HQ", legalLastName: "Administrator" }).returning(),
        ]).then(rows => rows.map(row => row[0]!));
        const [localAccount, hqAccount] = await Promise.all([
          tx.insert(schema.accessAccounts).values({ emailNormalized: "school-" + suffix + "@example.test" }).returning(),
          tx.insert(schema.accessAccounts).values({ emailNormalized: "hq-" + suffix + "@example.test" }).returning(),
        ]).then(rows => rows.map(row => row[0]!));
        const [localGrant] = await tx.insert(schema.accountPersonGrants).values({
          accountId: localAccount.id, personId: registrar.id, role: "registrar",
          organizationId: school.id, siteId: site.id, active: true,
        }).returning();
        const [hqGrant] = await tx.insert(schema.accountPersonGrants).values({
          accountId: hqAccount.id, personId: reviewer.id, role: "network_admin",
          organizationId: denom.id, siteId: null, active: true,
        }).returning();
        const { id: outsiderGrant } = (await tx.insert(schema.accountPersonGrants).values({
          accountId: hqAccount.id, personId: reviewer.id, role: "network_admin",
          organizationId: outsider.id, siteId: null, active: true,
        }).returning())[0]!;

        const [agreementEvidence] = await tx.insert(schema.documents).values({
          subjectType: "organization", subjectId: denom.id,
          category: "network_agreement", fileName: "synthetic-network-agreement.pdf",
          storageProvider: "synthetic-test", storageKey: "isolated-network-agreement",
          verifiedAt: new Date(Date.now() - 3600000),
          verifiedByPersonId: registrar.id, uploadedByPersonId: registrar.id,
        }).returning();
        await tx.insert(schema.networkAgreements).values({
          denominationOrganizationId: denom.id, agreementReference: "synthetic-" + suffix,
          evidenceDocumentId: agreementEvidence.id,
          validFrom: new Date(Date.now() - 86400000),
          validThrough: new Date(Date.now() + 86400000),
          verifiedByPersonId: registrar.id,
        });
        const principal = (accountId: string, activeGrantId: string) =>
          ({ accountId, activeGrantId, sessionId: "integration-session" });
        const registrarContext = resolveAccessContext(
          principal(localAccount.id, localGrant.id), [localGrant]);
        const reviewerContext = resolveAccessContext(
          principal(hqAccount.id, hqGrant.id), [hqGrant]);
        const unrelatedContext = resolveAccessContext(
          principal(hqAccount.id, outsiderGrant), [{...hqGrant,
            id: outsiderGrant, organizationId: outsider.id}]);

        state.context = registrarContext;
        const networks = await endpoints.listAffiliationNetworks();
        expect(networks.networks.some(n => n.id === denom.id)).toBe(true);
        const note = "We want to work with our denomination's high school network.";
        const request = { siteId: site.id, denominationOrganizationId: denom.id, note };
        const first = await endpoints.requestSiteAffiliation({ data: request });
        affiliationId = first.affiliationId;
        expect(first).toMatchObject({ status: "pending", created: true });
        expect(await endpoints.requestSiteAffiliation({ data: request })).toMatchObject({
          affiliationId, created: false, status: "pending",
        });
        expect((await endpoints.listSiteAffiliations({ data: { siteId: site.id } })).entries[0]?.status)
          .toBe("pending");

        state.context = unrelatedContext;
        await expect(endpoints.listNetworkAffiliations()).rejects.toThrow();
        await expect(endpoints.reviewNetworkAffiliation({ data: {
          affiliationId, decision: "approve", reason: "Looks appropriate",
        } })).rejects.toThrow();

        state.context = reviewerContext;
        const inbox = await endpoints.listNetworkAffiliations();
        expect(inbox.entries).toHaveLength(1);
        expect(inbox.entries[0]?.siteOrganizationName).toBe(school.name);
        expect(await endpoints.reviewNetworkAffiliation({ data: {
          affiliationId, decision: "approve", reason: "Local council approved",
        } })).toMatchObject({ status: "approved" });
        await expect(endpoints.reviewNetworkAffiliation({ data: {
          affiliationId, decision: "approve", reason: "Duplicate decision",
        } })).rejects.toThrow();

        const [stillOwned] = await tx.select({ organizationId: schema.sites.organizationId })
          .from(schema.sites).where(eq(schema.sites.id, site.id));
        expect(stillOwned.organizationId).toBe(school.id);

        state.context = registrarContext;
        expect((await endpoints.listSiteAffiliations({ data: { siteId: site.id } })).entries[0]?.status)
          .toBe("approved");
        const withdrawn = await endpoints.withdrawSiteAffiliation({ data: {
          siteId: site.id, affiliationId,
        } });
        expect(withdrawn.status).toBe("revoked");
        const events = await tx.select({ eventType: schema.domainEvents.eventType })
          .from(schema.domainEvents)
          .where(eq(schema.domainEvents.aggregateId, affiliationId));
        expect(events.map(e => e.eventType)).toEqual([
          "SiteAffiliationRequested", "SiteAffiliationApproved", "SiteAffiliationRevoked",
        ]);
        const audit = await tx.select({ action: schema.auditEvents.action })
          .from(schema.auditEvents).where(eq(schema.auditEvents.resourceId, affiliationId));
        expect(audit.map(a => a.action)).toEqual([
          "network.affiliation.request", "network.affiliation.approve", "network.affiliation.withdraw",
        ]);
        const [stillLocal] = await tx.select({ organizationId: schema.sites.organizationId })
          .from(schema.sites).where(eq(schema.sites.id, site.id));
        expect(stillLocal.organizationId).toBe(school.id);
        const activeHQ = await tx.select().from(schema.accountPersonGrants)
          .where(and(eq(schema.accountPersonGrants.role, "network_admin"),
            eq(schema.accountPersonGrants.organizationId, denom.id)));
        expect(activeHQ).toHaveLength(1);
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.context = null;
    }
    expect(checked).toBe(true);
    // The isolated test writes never survive its rollback.
    const { db: database2 } = await vi.importActual<{ db: Database }>("@/db/client");
    const schema = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(await database2.select().from(schema.siteAffiliations)
      .where(eq(schema.siteAffiliations.id, affiliationId))).toHaveLength(0);
  }, 120_000);
});
