import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  resolveDestination: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: {
  transaction: state.transaction,
  select: state.select,
} }));
vi.mock("@/modules/enrollment/public-family-start.server", () => ({
  requestPublicFamilyStart: vi.fn(),
  resolvePublishedFamilyStartDestination: state.resolveDestination,
}));
vi.mock("@/modules/enrollment/private-family-start.server", () => ({
  requestInvitedFamilyStart: vi.fn(),
  resolvePrivateFamilyStartDestination: state.resolveDestination,
}));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));

import {
  listFamilyInvitationWorkspace,
  sendFamilyInvitationBatch,
} from "@/modules/enrollment/family-invitations.server";

const programId = "22222222-2222-4222-8222-222222222222";
const input = {
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  programId,
  rawContacts: "family@example.test",
  subject: "Welcome families",
  introduction: "Welcome to our school.",
  confirmed: true as const,
  purpose: "application" as const,
};
const registrar = {
  actorPersonId: "registrar-person",
  role: "registrar",
  capabilities: new Set(["program.read", "communication.send"]),
  scope: {
    organizationIds: ["organization"],
    siteIds: ["site"],
    programIds: [programId],
  },
} as AccessContext;

beforeEach(() => {
  vi.clearAllMocks();
  state.resolveDestination.mockResolvedValue({
    programId,
    programName: "School",
    organizationId: "organization",
    siteId: "site",
    slug: "school",
  });
});

describe("family invitation authorization", () => {
  it.each([
    { ...registrar, role: "guardian" },
    { ...registrar, capabilities: new Set(["program.read"]) },
    { ...registrar, capabilities: new Set(["communication.send"]) },
    { ...registrar, actorPersonId: null },
    { ...registrar, scope: { ...registrar.scope, programIds: [] } },
  ])("denies an unverified role, capability, actor, or Program scope: %j", async actor => {
    await expect(sendFamilyInvitationBatch(actor, input)).rejects.toThrow(AuthorizationError);
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("denies workspace reads to a non-registrar before querying recipients", async () => {
    await expect(listFamilyInvitationWorkspace({ ...registrar, role: "teacher" }))
      .rejects.toThrow(AuthorizationError);
    expect(state.select).not.toHaveBeenCalled();
  });

  it("retains response history when a Program is no longer eligible for sending", async () => {
    const consumedAt = new Date("2026-01-02T03:04:05.000Z");
    state.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{
        id: programId,
        name: "Archived school",
        status: "closed",
        organizationId: "organization",
        siteId: "site",
      }] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{
        id: "33333333-3333-4333-8333-333333333333",
        subject: "Welcome families",
        contextId: programId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        metadata: {
          kind: "family_invitation_batch",
          version: 1,
          batchRequestId: input.requestId,
          siteSlug: "school",
          introduction: input.introduction,
          status: "complete",
          recipients: [{
            key: "44444444-4444-4444-8444-444444444444",
            firstName: "First",
            lastName: "Family",
            email: "family@example.test",
            status: "accepted",
            attempts: 1,
          }],
        },
      }] }) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{
        programId,
        email: "family@example.test",
        consumedAt,
      }] }) })
      .mockReturnValueOnce({ from: () => ({
        leftJoin: () => ({ leftJoin: () => ({ where: async () => [] }) }),
      }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) });

    const workspace = await listFamilyInvitationWorkspace(registrar);
    expect(state.resolveDestination).not.toHaveBeenCalled();
    expect(workspace.programs).toEqual([]);
    expect(workspace.batches).toHaveLength(1);
    expect(workspace.batches[0]).toMatchObject({
      programName: "Archived school",
      recipients: [{ status: "responded", respondedAt: consumedAt.toISOString() }],
    });
  });

  it("rechecks the resolved Site scope inside the mutation transaction", async () => {
    const tx = { execute: state.execute, select: vi.fn() };
    state.transaction.mockImplementation(callback => callback(tx));
    await expect(sendFamilyInvitationBatch({
      ...registrar,
      scope: { ...registrar.scope, siteIds: ["another-site"] },
    }, input)).rejects.toThrow(AuthorizationError);
    expect(state.resolveDestination).toHaveBeenCalledWith(tx, programId);
    expect(tx.select).not.toHaveBeenCalled();
  });
});
