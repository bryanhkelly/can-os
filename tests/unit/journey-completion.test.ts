import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents, domainEvents } from "@/db/schema";
import { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";

const { transaction, select, insert, update, values, set } = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  values: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction } }));

function query(rows: unknown[]) {
  const result = Promise.resolve(rows);
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    then: result.then.bind(result),
  };
}

const context = {
  actorPersonId: "actor",
  capabilities: new Set(["journey.requirement.complete"]),
  scope: { programIds: ["program"] },
  requestId: "request",
};
const current = {
  requirementId: "requirement",
  journeyId: "journey",
  requirementStatus: "needs_you",
  journeyStatus: "in_progress",
  organizationId: "organization",
  siteId: "site",
  programId: "program",
  metadata: {},
  evidence: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (callback) => callback({ select, insert, update }));
  insert.mockReturnValue({ values });
  values.mockImplementation(() => ({
    returning: vi.fn().mockResolvedValue([{ id: "event" }]),
    then: Promise.resolve(undefined).then.bind(Promise.resolve(undefined)),
  }));
  update.mockReturnValue({ set });
  set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});

describe("Journey completion transactions", () => {
  it("allows scoped school-owned program requirement completion", async () => {
    select.mockReturnValueOnce(query([{ ...current, participantType: "program" }]))
      .mockReturnValueOnce(query([]));
    await expect(completeJourneyRequirement(context, "requirement", [{ fact: "confirmed" }], {
      allowedCurrentStatuses: ["needs_you"],
    })).resolves.toBe("ready");
  });

  it("rejects program opening completion without an owner-specific workflow", async () => {
    select.mockReturnValueOnce(query([{ ...current, participantType: "program" }]));
    await expect(completeJourneyRequirement(context, "requirement")).rejects.toThrow("owner-specific workflow");
    expect(update).not.toHaveBeenCalled();
  });

  it("cannot waive a configured enrollment signature through generic completion", async () => {
    select.mockReturnValueOnce(query([{ ...current, metadata: { enrollmentForm: {} } }]));
    await expect(completeJourneyRequirement(context, "requirement")).rejects.toThrow("registrar review workflow");
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects generic completion for explicitly reviewed evidence", async () => {
    select.mockReturnValueOnce(query([{ ...current, metadata: { evidenceReviewRequired: true } }]));
    await expect(completeJourneyRequirement(context, "requirement")).rejects.toThrow("registrar review workflow");
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects generic completion when registrar notes are already recorded", async () => {
    select.mockReturnValueOnce(query([{ ...current, evidence: [{ kind: "registrar_note", text: "Pending review" }] }]));
    await expect(completeJourneyRequirement(context, "requirement")).rejects.toThrow("registrar review workflow");
    expect(update).not.toHaveBeenCalled();
  });
  it.each(["needs_can", "waiting_third_party"] as const)(
    "does not let a school-owned launch completion take over a %s requirement",
    async requirementStatus => {
      select.mockReturnValueOnce(query([{ ...current, requirementStatus }]));
      await expect(completeJourneyRequirement(context, "requirement", [], {
        allowedCurrentStatuses: ["needs_you"],
      })).rejects.toThrow("current owner's workflow");
      expect(update).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    },
  );
  it("locks the Journey and writes events and audit for both transitions", async () => {
    const locked = query([current]);
    select.mockReturnValueOnce(locked).mockReturnValueOnce(query([]));
    await expect(completeJourneyRequirement(context, "requirement")).resolves.toBe("ready");
    expect(locked.for).toHaveBeenCalledWith("update");
    expect(insert.mock.calls.filter(([table]) => table === auditEvents)).toHaveLength(2);
    expect(insert.mock.calls.filter(([table]) => table === domainEvents)).toHaveLength(2);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "journey.ready",
      before: { status: "in_progress" },
      after: { status: "ready" },
    }));
  });

  it("preserves existing evidence when recording school-owned completion", async () => {
    select.mockReturnValueOnce(query([{ ...current, evidence: [{ kind: "previous", fact: "recorded" }] }]))
      .mockReturnValueOnce(query([]));
    await completeJourneyRequirement(context, "requirement", [{ fact: "school_confirmed" }]);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      evidence: [{ kind: "previous", fact: "recorded" }, { fact: "school_confirmed" }],
    }));
  });

  it("does not promote a Journey while blocking requirements remain", async () => {
    select.mockReturnValueOnce(query([current])).mockReturnValueOnce(query([{ id: "blocking" }]));
    await expect(completeJourneyRequirement(context, "requirement")).resolves.toBe("in_progress");
    expect(update).toHaveBeenCalledTimes(1);
    expect(values).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: "JourneyReady" }));
  });

  it.each(["active", "complete"])("does not rewind a %s Journey on retry", async (journeyStatus) => {
    select.mockReturnValueOnce(query([{ ...current, journeyStatus, requirementStatus: "complete" }]));
    await expect(completeJourneyRequirement(context, "requirement")).resolves.toBe("ready");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["active", "complete", "cancelled"])("rejects requirement changes for a %s Journey", async (journeyStatus) => {
    select.mockReturnValueOnce(query([{ ...current, journeyStatus }]));
    await expect(completeJourneyRequirement(context, "requirement")).rejects.toThrow("Journey");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("allows an idempotent retry after reviewed evidence is already complete", async () => {
    select.mockReturnValueOnce(query([{ ...current, journeyStatus: "ready", requirementStatus: "complete",
      metadata: { evidenceReviewRequired: true }, evidence: [{ kind: "document_review", status: "accepted" }] }]))
      .mockReturnValueOnce(query([]));
    await expect(completeJourneyRequirement(context, "requirement")).resolves.toBe("ready");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not duplicate completion events on a ready retry", async () => {
    select.mockReturnValueOnce(query([{ ...current, journeyStatus: "ready", requirementStatus: "complete" }]))
      .mockReturnValueOnce(query([]));
    await expect(completeJourneyRequirement(context, "requirement")).resolves.toBe("ready");
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
