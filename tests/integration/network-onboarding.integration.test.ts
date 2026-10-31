import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { resolveAccessContext } from "@/domain/access-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Network onboarding tests require rollback transaction");
    return state.tx;
  },
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("CAN verified network contracts and HQ officer access", () => {
  it("requires verified documents, steward grant and current agreement before issuing HQ membership", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-network-onboarding");
    let completed = false;
    let agreementId = "";
    let officerGrantId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const { verifyAgreement, provisionHQOfficer } = await import(
          "@/modules/networks/network-steward.server");
        const suffix = crypto.randomUUID().slice(0, 8);
        const [can, denomination] = await Promise.all([
          tx.insert(s.organizations).values({
            type: "can_network", name: "CAN " + suffix, slug: "can-" + suffix,
          }).returning(),
          tx.insert(s.organizations).values({
            type: "denomination", name: "Network " + suffix, slug: "network-" + suffix,
          }).returning(),
        ]).then(x => x.map(row => row[0]!));
        const [steward, verifier] = await Promise.all([
          tx.insert(s.people).values({ legalFirstName: "CAN", legalLastName: "Steward" }).returning(),
          tx.insert(s.people).values({ legalFirstName: "Independent", legalLastName: "Verifier" }).returning(),
        ]).then(x => x.map(row => row[0]!));
        const email = "hq-" + suffix + "@example.test";
        const [agreementDoc, authorityDoc, wrongAuthorityDoc] = await Promise.all([
          tx.insert(s.documents).values({
            subjectType: "organization", subjectId: denomination.id,
            category: "network_agreement", fileName: "signed.pdf", storageProvider: "synthetic-test",
            storageKey: "signed-" + suffix, uploadedByPersonId: steward.id,
            verifiedAt: new Date(Date.now() - 3600000), verifiedByPersonId: verifier.id,
          }).returning(),
          tx.insert(s.documents).values({
            subjectType: "organization", subjectId: denomination.id,
            category: "network_hq_authority", fileName: "appointment.pdf",
            storageProvider: "synthetic-test", storageKey: "authorized-" + suffix,
            uploadedByPersonId: steward.id, verifiedAt: new Date(Date.now() - 3600000),
            verifiedByPersonId: verifier.id,
            metadata: { authorizedEmailNormalized: email },
          }).returning(),
          tx.insert(s.documents).values({
            subjectType: "organization", subjectId: denomination.id,
            category: "network_hq_authority", fileName: "wrong.pdf",
            storageProvider: "synthetic-test", storageKey: "wrong-" + suffix,
            uploadedByPersonId: steward.id, verifiedAt: new Date(Date.now() - 3600000),
            verifiedByPersonId: verifier.id,
            metadata: { authorizedEmailNormalized: "different@example.test" },
          }).returning(),
        ]).then(x => x.map(row => row[0]!));
        const grant = { id: crypto.randomUUID(), accountId: crypto.randomUUID(),
          personId: steward.id, role: "can_network_steward",
          organizationId: can.id, siteId: null, active: true };
        const actor = resolveAccessContext({
          accountId: grant.accountId, activeGrantId: grant.id, sessionId: "synthetic-session",
        }, [grant]);
        const outsider = resolveAccessContext({
          accountId: grant.accountId, activeGrantId: grant.id, sessionId: "synthetic-session",
        }, [{...grant, role: "registrar"}]);

        await expect(provisionHQOfficer(actor, {
          denominationOrganizationId: denomination.id, authorityDocumentId: authorityDoc.id,
          firstName: "HQ", lastName: "Officer", email,
        })).rejects.toThrow();

        await expect(verifyAgreement(outsider, {
          denominationOrganizationId: denomination.id, agreementReference: "signed-" + suffix,
          evidenceDocumentId: agreementDoc.id, validFrom: new Date(Date.now()-3600000),
          validThrough: new Date(Date.now()+86400000),
        })).rejects.toThrow();

        const from = new Date(Date.now()-3600000);
        const through = new Date(Date.now()+86400000);
        const data = { denominationOrganizationId: denomination.id,
          agreementReference: "signed-" + suffix, evidenceDocumentId: agreementDoc.id,
          validFrom: from, validThrough: through };
        const result = await verifyAgreement(actor, data);
        agreementId = result.agreementId;
        expect(result.created).toBe(true);
        expect(await verifyAgreement(actor, data)).toMatchObject({
          agreementId, created: false,
        });

        await expect(provisionHQOfficer(actor, {
          denominationOrganizationId: denomination.id, authorityDocumentId: wrongAuthorityDoc.id,
          firstName: "HQ", lastName: "Officer", email,
        })).rejects.toThrow();

        const officer = { denominationOrganizationId: denomination.id,
          authorityDocumentId: authorityDoc.id, email,
          firstName: "HQ", lastName: "Officer" };
        const createdOfficer = await provisionHQOfficer(actor, officer);
        officerGrantId = createdOfficer.grantId;
        expect(createdOfficer.created).toBe(true);
        expect(await provisionHQOfficer(actor, officer)).toMatchObject({
          grantId: officerGrantId, created: false,
        });
        const [savedGrant] = await tx.select().from(s.accountPersonGrants)
          .where(eq(s.accountPersonGrants.id, officerGrantId));
        expect(savedGrant.role).toBe("network_admin");
        expect(savedGrant.organizationId).toBe(denomination.id);
        expect(savedGrant.siteId).toBeNull();

        const [savedAccount] = await tx.select().from(s.accessAccounts)
          .where(eq(s.accessAccounts.id, savedGrant.accountId));
        expect(savedAccount.emailNormalized).toBe(email);
        // Revoked contracts deny *new* HQ authorization despite previously provisioned grants.
        await tx.update(s.networkAgreements).set({ revokedAt: new Date() })
          .where(eq(s.networkAgreements.id, agreementId));
        await expect(provisionHQOfficer(actor, officer)).rejects.toThrow();

        const logged = await tx.select({action: s.auditEvents.action}).from(s.auditEvents)
          .where(eq(s.auditEvents.resourceId, agreementId));
        expect(logged.some(row => row.action === "network.agreement.verify")).toBe(true);
        const officerAudit = await tx.select({action: s.auditEvents.action}).from(s.auditEvents)
          .where(eq(s.auditEvents.resourceId, officerGrantId));
        expect(officerAudit.some(row => row.action === "network.officer.provision")).toBe(true);
        completed = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally { state.tx = undefined; }
    expect(completed).toBe(true);
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(await realDb.select().from(s.networkAgreements)
      .where(eq(s.networkAgreements.id, agreementId))).toHaveLength(0);
    expect(await realDb.select().from(s.accountPersonGrants)
      .where(eq(s.accountPersonGrants.id, officerGrantId))).toHaveLength(0);
  }, 120_000);
});
