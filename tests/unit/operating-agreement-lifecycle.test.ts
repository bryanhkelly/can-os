import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { requestProgramSiteAuthorization, revokeProgramSiteAuthorization } from "@/modules/programs/program-site-authorization.server";
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
