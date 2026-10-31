import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import type { FamilyInvitationBatchMetadata } from "@/domain/family-invitations";

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  emitEvent: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: {
  transaction: state.transaction,
  select: vi.fn(),
} }));
vi.mock("@/modules/enrollment/public-family-start.server", () => ({
  requestPublicFamilyStart: vi.fn(),
  resolvePublishedFamilyStartDestination: vi.fn(),
}));
vi.mock("@/platform/mutation", () => ({
  emitEvent: state.emitEvent,
  writeAudit: state.writeAudit,
}));

import { requestFamilyInvitationRetry } from "@/modules/enrollment/family-invitations.server";

const batchId = "33333333-3333-4333-8333-333333333333";
const programId = "22222222-2222-4222-8222-222222222222";
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

function metadataWith(statuses: Array<"queued" | "accepted" | "failed">): FamilyInvitationBatchMetadata {
  return {
    kind: "family_invitation_batch",
    version: 1,
    batchRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    siteSlug: "school",
    introduction: "Welcome to our school.",
    status: statuses.includes("failed") ? "retrying" : "queued",
    recipients: statuses.map((status, index) => ({
      key: `44444444-4444-4444-8444-44444444444${index}`,
      firstName: "First",
      lastName: "Family",
      email: `family${index}@example.test`,
      status,
      attempts: 1,
    })),
  };
}

function txWith(results: { thread?: unknown[]; program?: unknown[]; inFlight?: unknown[] }) {
  const select = vi.fn()
    .mockReturnValueOnce({ from: () => ({ where: () => ({
      for: () => ({ limit: async () => results.thread ?? [] }),
    }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({
      limit: async () => results.program ?? [],
    }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({
      limit: async () => results.inFlight ?? [],
    }) }) });
  return { select };
}

const threadWith = (metadata: FamilyInvitationBatchMetadata) => [{
  id: batchId,
  contextId: programId,
  metadata,
}];
const program = [{ organizationId: "organization", siteId: "site" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family invitation retry authorization", () => {
  it.each([
    { ...registrar, role: "guardian" },
    { ...registrar, role: "teacher" },
    { ...registrar, capabilities: new Set(["program.read"]) },
    { ...registrar, capabilities: new Set(["communication.send"]) },
    { ...registrar, actorPersonId: null },
  ])("denies an unverified role, capability, or actor before querying: %j", async actor => {
    await expect(requestFamilyInvitationRetry(actor, batchId)).rejects.toThrow(AuthorizationError);
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("denies a registrar when the batch Program is outside their scope", async () => {
    state.transaction.mockImplementation(callback => callback(txWith({
      thread: threadWith(metadataWith(["failed"])),
      program,
    })));
    await expect(requestFamilyInvitationRetry({
      ...registrar,
      scope: { ...registrar.scope, programIds: ["another-program"] },
    }, batchId)).rejects.toThrow(AuthorizationError);
    expect(state.emitEvent).not.toHaveBeenCalled();
  });

  it("denies a registrar when the batch Organization is outside their scope", async () => {
    state.transaction.mockImplementation(callback => callback(txWith({
      thread: threadWith(metadataWith(["failed"])),
      program,
    })));
    await expect(requestFamilyInvitationRetry({
      ...registrar,
      scope: { ...registrar.scope, organizationIds: ["another-organization"] },
    }, batchId)).rejects.toThrow(AuthorizationError);
    expect(state.emitEvent).not.toHaveBeenCalled();
  });

  it("rejects an unknown or non-invitation batch", async () => {
    state.transaction.mockImplementation(callback => callback(txWith({ thread: [] })));
    await expect(requestFamilyInvitationRetry(registrar, batchId))
      .rejects.toThrow("Family invitation batch unavailable");
    expect(state.emitEvent).not.toHaveBeenCalled();
  });
});

describe("family invitation retry behavior", () => {
  it("emits no event when no recipient has failed", async () => {
    state.transaction.mockImplementation(callback => callback(txWith({
      thread: threadWith(metadataWith(["accepted", "queued"])),
      program,
    })));
    const result = await requestFamilyInvitationRetry(registrar, batchId);
    expect(result).toEqual({ batchId, retried: 0 });
    expect(state.emitEvent).not.toHaveBeenCalled();
    expect(state.writeAudit).not.toHaveBeenCalled();
  });

  it("requeues only failed recipients through the existing batch consumer", async () => {
    state.transaction.mockImplementation(callback => callback(txWith({
      thread: threadWith(metadataWith(["accepted", "failed", "failed"])),
      program,
    })));
    const result = await requestFamilyInvitationRetry(registrar, batchId);
    expect(result).toEqual({ batchId, retried: 2 });
    expect(state.emitEvent).toHaveBeenCalledTimes(1);
    const [tx, event] = state.emitEvent.mock.calls[0]!;
    expect(tx).toBeDefined();
    expect(event).toMatchObject({
      aggregateType: "communication_thread",
      aggregateId: batchId,
      programId,
      payload: { recipientCount: 2, retry: true },
    });
    expect(state.writeAudit).toHaveBeenCalledTimes(1);
    expect(state.writeAudit.mock.calls[0]![2]).toMatchObject({
      action: "family.invitation_batch.retry",
      after: { retriedRecipients: 2 },
    });
  });

  it("refuses to stack a retry while an event is still pending or processing", async () => {
    for (const inFlight of [[{ id: "event-pending" }]]) {
      state.transaction.mockImplementationOnce(callback => callback(txWith({
        thread: threadWith(metadataWith(["failed"])),
        program,
        inFlight,
      })));
      await expect(requestFamilyInvitationRetry(registrar, batchId))
        .rejects.toThrow("A retry is already being processed for this batch");
      expect(state.emitEvent).not.toHaveBeenCalled();
    }
  });
});
