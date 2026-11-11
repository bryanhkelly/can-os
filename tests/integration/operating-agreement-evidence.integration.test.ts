import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { resolveAccessContext, type AccessContext } from "@/domain/access-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Operating agreement evidence tests must stay in the rollback transaction");
    return state.tx;
  },
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing operating agreement fixture row");
  return row;
}

function contextFor(
  role: "registrar" | "can_network_steward" | "site_staff",
  personId: string, organizationId: string, siteId: string | null, programId: string,
): AccessContext {
  const grant = {
    id: crypto.randomUUID(), accountId: crypto.randomUUID(), personId, role,
    organizationId, siteId, active: true,
  };
  const context = resolveAccessContext(
    { accountId: grant.accountId, sessionId: "operating-agreement-test", activeGrantId: grant.id },
    [grant],
  );
  context.scope.programIds = [programId];
  return context;
}

const services = [
  "academic_instruction", "curriculum", "school_of_record",
  "credit_issuance", "admissions", "academic_records", "onsite_supervision",
];

/** Church-hosted CAN program plus host registrar, CAN steward and an independent verifier. */
async function seedChurchCanProgram(tx: Transaction, suffix: string) {
  const s = await import("@/db/schema");
  const can = first(await tx.insert(s.organizations).values({
    type: "can_network", name: `CAN Evidence ${suffix}`, slug: `can-evidence-${suffix}`,
  }).returning());
  const church = first(await tx.insert(s.organizations).values({
    type: "church", name: `Church Evidence ${suffix}`, slug: `church-evidence-${suffix}`,
  }).returning());
  const other = first(await tx.insert(s.organizations).values({
    type: "church", name: `Other Church ${suffix}`, slug: `other-evidence-${suffix}`,
  }).returning());
  const site = first(await tx.insert(s.sites).values({
    organizationId: church.id, name: "Evidence Campus", slug: `evidence-site-${suffix}`,
  }).returning());
  const jurisdiction = first(await tx.insert(s.jurisdictions).values({
    code: `evd-${suffix}`, name: "Evidence test jurisdiction",
  }).returning());
  const program = first(await tx.insert(s.programs).values({
    organizationId: church.id, siteId: site.id, jurisdictionId: jurisdiction.id,
    type: "church_hosted_academy", status: "active", name: "Evidence Academy",
    slug: `evidence-${suffix}`, gradeRange: { min: "9", max: "12" },
    deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
    hostOrganizationId: church.id,
    academicProviderOrganizationId: can.id,
    creditIssuingOrganizationId: can.id,
  }).returning());
  const registrarPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Host", legalLastName: `Registrar-${suffix}`,
  }).returning());
  const stewardPerson = first(await tx.insert(s.people).values({
    legalFirstName: "CAN", legalLastName: `Steward-${suffix}`,
  }).returning());
  const verifierPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Independent", legalLastName: `Verifier-${suffix}`,
  }).returning());
  const otherPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Other", legalLastName: `Registrar-${suffix}`,
  }).returning());
  const staffPerson = first(await tx.insert(s.people).values({
    legalFirstName: "Site", legalLastName: `Staff-${suffix}`,
  }).returning());
  const host = contextFor("registrar", registrarPerson.id, church.id, site.id, program.id);
  const steward = contextFor("can_network_steward", stewardPerson.id, can.id, null, program.id);
  const outsider = contextFor("registrar", otherPerson.id, other.id, null, program.id);
  const staff = contextFor("site_staff", staffPerson.id, church.id, site.id, program.id);
  return { can, church, site, program, registrarPerson, stewardPerson, verifierPerson,
    host, steward, outsider, staff };
}

function evidenceInput(seed: Awaited<ReturnType<typeof seedChurchCanProgram>>, days = 180) {
  return {
    programId: seed.program.id, siteId: seed.site.id,
    fileName: "signed-operating-agreement.pdf",
    effectiveThrough: new Date(Date.now() + days * 86400_000),
    expiresAt: new Date(Date.now() + (days + 30) * 86400_000),
    verifierPersonId: seed.verifierPerson.id,
    hostSignatureVerified: true, institutionSignatureVerified: true,
    authorizedServices: [...services],
  };
}

integration("operating agreement evidence registration", () => {
  it("registers evidence that reaches independent steward approval through the product flow", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-operating-agreement-evidence");
    let complete = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const {
          registerOperatingAgreementEvidence, requestProgramSiteAuthorization,
          reviewProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0, 8);
        const seed = await seedChurchCanProgram(tx, suffix);
        const input = evidenceInput(seed);

        const registered = await registerOperatingAgreementEvidence(seed.host, input);
        expect(registered.created).toBe(true);
        const [document] = await tx.select().from(s.documents)
          .where(eq(s.documents.id, registered.documentId)).limit(1);
        expect(document).toMatchObject({
          subjectType: "program", subjectId: seed.program.id,
          category: "program_site_operating_agreement",
          storageProvider: "external_record", sensitivityTier: "restricted",
          verifiedByPersonId: seed.verifierPerson.id,
          uploadedByPersonId: seed.registrarPerson.id,
        });
        expect(document.verifiedAt).not.toBeNull();
        expect(document.expiresAt?.toISOString()).toBe(input.expiresAt.toISOString());
        expect(document.metadata).toMatchObject({
          hostOrganizationId: seed.church.id, institutionOrganizationId: seed.can.id,
          siteId: seed.site.id, creditIssuingOrganizationId: seed.can.id,
          hostSignatureVerified: true, institutionSignatureVerified: true,
          authorizedServices: [...services].sort(),
        });
        expect(typeof document.metadata.contentHash).toBe("string");

        const requested = await requestProgramSiteAuthorization(seed.host, {
          programId: seed.program.id, services,
        });
        expect(requested).toMatchObject({ created: true, status: "requested" });
        const reviewed = await reviewProgramSiteAuthorization(seed.steward, {
          authorizationId: requested.authorizationId, decision: "approved",
          reason: "Independent verification of both contracting organizations.",
          evidenceDocumentId: registered.documentId,
          effectiveFrom: new Date(Date.now() - 3600_000),
          effectiveThrough: input.effectiveThrough,
        });
        expect(reviewed).toMatchObject({ status: "approved" });
        expect(await requireCurrentProgramSiteAuthorization(tx, seed.program.id, [
          "academic_instruction", "onsite_supervision", "credit_issuance",
        ])).toBe(requested.authorizationId);

        const audits = await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "program.site.operating_agreement_evidence.register"),
          eq(s.auditEvents.resourceType, "document"),
          eq(s.auditEvents.resourceId, registered.documentId),
        ));
        expect(audits).toHaveLength(1);
        const events = await tx.select({
          aggregateType: s.domainEvents.aggregateType,
        }).from(s.domainEvents).where(and(
          eq(s.domainEvents.eventType, "OperatingAgreementEvidenceRegistered"),
          eq(s.domainEvents.aggregateId, registered.documentId),
        ));
        expect(events).toEqual([{ aggregateType: "document" }]);

        complete = true;
        throw rollback;
      });
    } catch (error) {
      expect(error).toBe(rollback);
    }
    expect(complete).toBe(true);
  }, 120_000);

  it("re-registers the same agreement idempotently without duplicate audit or event", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-operating-agreement-idempotency");
    let complete = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { registerOperatingAgreementEvidence } =
          await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0, 8);
        const seed = await seedChurchCanProgram(tx, suffix);
        const input = evidenceInput(seed);

        const created = await registerOperatingAgreementEvidence(seed.host, input);
        expect(created.created).toBe(true);
        const replayed = await registerOperatingAgreementEvidence(seed.host, input);
        expect(replayed).toEqual({ documentId: created.documentId, created: false });

        const documents = await tx.select({ id: s.documents.id }).from(s.documents).where(and(
          eq(s.documents.subjectType, "program"), eq(s.documents.subjectId, seed.program.id),
          eq(s.documents.category, "program_site_operating_agreement"),
        ));
        expect(documents).toHaveLength(1);
        const audits = await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "program.site.operating_agreement_evidence.register"),
          eq(s.auditEvents.resourceId, created.documentId),
        ));
        expect(audits).toHaveLength(1);
        const events = await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.eventType, "OperatingAgreementEvidenceRegistered"),
          eq(s.domainEvents.aggregateId, created.documentId),
        ));
        expect(events).toHaveLength(1);

        complete = true;
        throw rollback;
      });
    } catch (error) {
      expect(error).toBe(rollback);
    }
    expect(complete).toBe(true);
  }, 120_000);

  it("denies unauthorized actors, self-verified or unsigned evidence and disabled uploads", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-operating-agreement-denials");
    let complete = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { registerOperatingAgreementEvidence } =
          await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0, 8);
        const seed = await seedChurchCanProgram(tx, suffix);
        const input = evidenceInput(seed);

        // Non-registrar and out-of-scope registrar never reach the document write.
        await expect(registerOperatingAgreementEvidence(seed.staff, input))
          .rejects.toThrow("verified church-host registrar for this Program and Site");
        await expect(registerOperatingAgreementEvidence(seed.outsider, input))
          .rejects.toThrow("verified church-host registrar for this Program and Site");

        // The domain policy rejects unsigned, self-verified or service-less evidence.
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, hostSignatureVerified: false,
        })).rejects.toThrow("independently verified two-party operating agreement evidence");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, institutionSignatureVerified: false,
        })).rejects.toThrow("independently verified two-party operating agreement evidence");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, verifierPersonId: seed.registrarPerson.id,
        })).rejects.toThrow("independently verified two-party operating agreement evidence");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, authorizedServices: [],
        })).rejects.toThrow("recognized and nonduplicate contracted services");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, expiresAt: new Date(Date.now() + 30 * 86400_000),
        })).rejects.toThrow("independently verified two-party operating agreement evidence");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, siteId: crypto.randomUUID(),
        })).rejects.toThrow("operating agreement evidence for this Program's exact Site");

        // Private object keys are refused while R2 uploads are disabled.
        vi.stubEnv("CAN_R2_OPERATING_AGREEMENT_UPLOADS_ENABLED", "false");
        await expect(registerOperatingAgreementEvidence(seed.host, {
          ...input, storageKey: `operating-agreements/${seed.program.id}/${crypto.randomUUID()}`,
          mimeType: "application/pdf", fileSize: 1024,
        })).rejects.toThrow("Operating agreement evidence uploads are not enabled");
        vi.unstubAllEnvs();

        const documents = await tx.select({ id: s.documents.id }).from(s.documents).where(and(
          eq(s.documents.subjectType, "program"), eq(s.documents.subjectId, seed.program.id),
          eq(s.documents.category, "program_site_operating_agreement"),
        ));
        expect(documents).toHaveLength(0);

        complete = true;
        throw rollback;
      });
    } catch (error) {
      expect(error).toBe(rollback);
    }
    expect(complete).toBe(true);
  }, 120_000);
});
