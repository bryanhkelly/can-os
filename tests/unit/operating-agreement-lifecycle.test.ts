import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { requestProgramSiteAuthorization, revokeProgramSiteAuthorization, suspendProgramSiteAuthorization, resumeProgramSiteAuthorization, renewProgramSiteAuthorization } from "@/modules/programs/program-site-authorization.server";
import { assertCurrentOperatingAuthorization, assertOperatingAgreementEvidence } from "@/domain/program-site-operating-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], writes: [] as Record<string, unknown>[] }));
vi.mock("@/db/client", () => {
  const tx = {
    select() { return {
      from() { return this; }, where() { return this; }, for() { return this; },
      orderBy() { return this; }, async limit() { return state.rows.shift() ?? []; },
    }; },
    update() { return { set(value: Record<string, unknown>) {
      state.writes.push(value); return { async where() {} };
    } }; },
    insert() { throw new Error("Unexpected replacement insert"); },
  };
  return { db: { transaction: (fn: (value: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));
const host: AccessContext = {
  actorPersonId: "host", accountId: "account", sessionId: "session", grantId: "grant",
  grantSiteId: "site", role: "registrar", capabilities: new Set(["program.launch.start"]),
  scope: { organizationIds: ["church"], siteIds: ["site"], programIds: ["program"] },
};
const steward: AccessContext = { ...host, actorPersonId: "steward", grantSiteId: null,
  role: "can_network_steward", capabilities: new Set(["network.agreements.verify"]),
  scope: { organizationIds: ["can"], siteIds: [], programIds: [] } };
const identityRows = () => [
  [{ id: "program", organizationId: "church", siteId: "site", hostOrganizationId: "church",
    institutionOrganizationId: "can", creditIssuingOrganizationId: null }],
  [{ organizationId: "church" }], [{ type: "church" }], [{ type: "can_network" }],
];
const record = { id: "agreement", programId: "program", siteId: "site",
  hostOrganizationId: "church", institutionOrganizationId: "can", status: "suspended" };
beforeEach(() => { state.rows = []; state.writes = []; vi.clearAllMocks(); });
describe("current operating agreement lifecycle", () => {
  it.each(["approved", "suspended"])("rejects replacement of %s authority before insert", async status => {
    state.rows = [[{ id: "program" }], ...identityRows(), [{ ...record, status }]];
    await expect(requestProgramSiteAuthorization(host, { programId: "program", services: ["academic_instruction"] }))
      .rejects.toThrow("Revoke the current authorization before requesting a replacement");
    expect(state.writes).toEqual([]); expect(writeAudit).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });
  it.each([host, steward])("allows $role to revoke suspended authority with truthful audit", async actor => {
    state.rows = [[record], ...identityRows()];
    await expect(revokeProgramSiteAuthorization(actor, { authorizationId: "agreement", reason: "Contracting party withdraws services." }))
      .resolves.toEqual({ authorizationId: "agreement", status: "revoked" });
    expect(state.writes).toEqual([expect.objectContaining({ status: "revoked", revokedByPersonId: actor.actorPersonId })]);
    expect(state.writes[0]).toHaveProperty("suspendedAt", null);
    expect(state.writes[0]).toHaveProperty("suspensionReason", null);
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({
      before: expect.objectContaining({ status: "suspended" }), after: { status: "revoked", reason: "Contracting party withdraws services." },
    }));
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "ProgramSiteAuthorizationRevoked" }));
  });
  it.each(["requested", "denied", "revoked"])("refuses revocation of %s", async status => {
    state.rows = [[{ ...record, status }], ...identityRows()];
    await expect(revokeProgramSiteAuthorization(host, { authorizationId: "agreement", reason: "Contracting party withdraws services." })).rejects.toThrow("Only a currently approved or suspended");
    expect(state.writes).toEqual([]); expect(writeAudit).not.toHaveBeenCalled();
  });
  it.each([
    { ...host, scope: { organizationIds: ["other"], siteIds: ["site"], programIds: ["program"] } },
    { ...steward, scope: { organizationIds: ["other"] } },
  ])("denies an unrelated $role without mutation", async actor => {
    state.rows = [[record], ...identityRows()];
    await expect(revokeProgramSiteAuthorization(actor, { authorizationId: "agreement", reason: "Unrelated party must be denied." })).rejects.toThrow();
    expect(state.writes).toEqual([]); expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe("CAN-only suspension and resumption", () => {
  const reason = "Independent CAN compliance decision recorded.";
  it.each([
    ["suspend", suspendProgramSiteAuthorization, "approved"],
    ["resume", resumeProgramSiteAuthorization, "suspended"],
  ] as const)("denies host and requester attempts to %s", async (_name, command, status) => {
    for (const actor of [host, { ...steward, actorPersonId: "requester" }]) {
      state.rows = [[{ ...record, status, requestedByPersonId: "requester" }], ...identityRows()];
      await expect(command(actor, { authorizationId: "agreement", reason })).rejects.toThrow();
      expect(state.writes).toEqual([]);
      expect(emitEvent).not.toHaveBeenCalled();
    }
  });
  it.each([
    [suspendProgramSiteAuthorization, "approved", "suspended", "ProgramSiteAuthorizationSuspended"],
    [resumeProgramSiteAuthorization, "suspended", "approved", "ProgramSiteAuthorizationResumed"],
  ] as const)("changes only lifecycle state under independent CAN authority", async (command, status, result, eventType) => {
    state.rows = [[{ ...record, status, requestedByPersonId: "requester" }], ...identityRows()];
    await expect(command(steward, { authorizationId: "agreement", reason }))
      .resolves.toEqual({ authorizationId: "agreement", status: result });
    expect(state.writes[0]).toMatchObject({ status: result });
    expect(state.writes[0]).not.toHaveProperty("effectiveThrough");
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType }));
  });
});

describe("renewal by a different independent CAN steward", () => {
  it("keeps new evidence usable on the next entitlement read and audits the previous reviewer", async () => {
    const before = new Date(Date.now() - 86_400_000);
    const through = new Date(Date.now() + 86_400_000);
    const renewedThrough = new Date(Date.now() + 86_400_000 * 30);
    const agreement = { ...record, status: "approved", services: ["academic_instruction" as const],
      requestedByPersonId: "requester", reviewedByPersonId: "original-approver",
      reviewedAt: before, effectiveFrom: before, effectiveThrough: through,
      revokedAt: null, evidenceDocumentId: "old-document", version: 1 };
    const identity = { programId: "program", programOrganizationId: "church", siteId: "site",
      siteOrganizationId: "church", hostOrganizationId: "church", hostOrganizationType: "church",
      institutionOrganizationId: "can", institutionOrganizationType: "can_network",
      creditIssuingOrganizationId: null };
    const evidence = { subjectType: "program", subjectId: "program",
      category: "program_site_operating_agreement", verifiedAt: before,
      verifiedByPersonId: "original-approver", expiresAt: renewedThrough,
      metadata: { hostOrganizationId: "church", institutionOrganizationId: "can", siteId: "site",
        hostSignatureVerified: true, institutionSignatureVerified: true,
        authorizedServices: ["academic_instruction"] } };
    state.rows = [[agreement], ...identityRows(), [evidence]];
    await expect(renewProgramSiteAuthorization(steward, {
      authorizationId: "agreement", evidenceDocumentId: "renewal-document",
      effectiveThrough: renewedThrough, reason: "Independent renewal by the current CAN steward.",
    })).resolves.toEqual({ authorizationId: "agreement", renewed: true });
    const renewed = { ...agreement, ...state.writes[0] } as typeof agreement;
    // With the old approver retained, the new evidence fails the very next read.
    expect(() => assertOperatingAgreementEvidence(evidence, identity, agreement.services,
      agreement.requestedByPersonId, agreement.reviewedByPersonId, renewedThrough)).toThrow();
    expect(() => assertOperatingAgreementEvidence(evidence, identity, renewed.services,
      renewed.requestedByPersonId, renewed.reviewedByPersonId, renewedThrough)).not.toThrow();
    expect(() => assertCurrentOperatingAuthorization(renewed, identity, ["academic_instruction"])).not.toThrow();
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(), steward, expect.objectContaining({
      before: expect.objectContaining({ reviewedByPersonId: "original-approver",
        reviewedAt: before.toISOString(), evidenceDocumentId: "old-document" }),
      after: expect.objectContaining({ reviewedByPersonId: "steward", evidenceDocumentId: "renewal-document" }),
    }));
    // Renewal updates only agreement evidence, validity, reviewer and timestamp.
    expect(Object.keys(state.writes[0]).sort()).toEqual([
      "effectiveThrough", "evidenceDocumentId", "reviewedAt", "reviewedByPersonId", "updatedAt",
    ]);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "ProgramSiteAuthorizationRenewed",
    }));
  });
});
