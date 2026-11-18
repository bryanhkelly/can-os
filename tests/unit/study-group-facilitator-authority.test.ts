import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/actors.server";
import { facilitatedGroup } from "@/modules/study-groups/canonical-membership.server";

const { authorizeClass } = vi.hoisted(() => ({ authorizeClass: vi.fn() }));
vi.mock("@/modules/learning/class-access.server", () => ({ authorizeClass }));

const actor: Actor = {
  accountId: "account", sessionId: "session", grantId: "grant",
  actorPersonId: "teacher", role: "teacher", capabilities: new Set(),
  scope: { sectionIds: ["section-a"], siteIds: [], programIds: [] },
  requestId: "request",
};

function transactionFor(group: Record<string, unknown>) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([group]),
  };
  return { select: vi.fn(() => query) } as unknown as Parameters<typeof facilitatedGroup>[0];
}

const sectionGroup = {
  id: "group", status: "active", facilitatorPersonId: "teacher",
  sectionId: "section-a", siteId: "site-a", programId: "program-a",
};

beforeEach(() => {
  vi.resetAllMocks();
  authorizeClass.mockResolvedValue({
    section: { id: "section-a", siteId: "site-a", programId: "program-a" },
  });
});

describe("study group facilitator authority", () => {
  it("accepts only the same qualified Section authority used by Class and Gradebook", async () => {
    const tx = transactionFor(sectionGroup);
    await expect(facilitatedGroup(tx, actor, sectionGroup.id)).resolves.toEqual(sectionGroup);
    expect(authorizeClass).toHaveBeenCalledExactlyOnceWith(actor, "section-a", undefined, tx);
  });

  it("rejects a revoked or unqualified teaching assignment", async () => {
    authorizeClass.mockRejectedValueOnce(new Error("teaching delegation expired"));
    await expect(facilitatedGroup(transactionFor(sectionGroup), actor, sectionGroup.id))
      .rejects.toThrow("teaching delegation expired");
  });

  it("rejects a group pointing at another Site or Program even when the Section is valid", async () => {
    authorizeClass.mockResolvedValueOnce({
      section: { id: "section-a", siteId: "site-other", programId: "program-a" },
    });
    await expect(facilitatedGroup(transactionFor(sectionGroup), actor, sectionGroup.id))
      .rejects.toThrow("study group current section scope");
  });

  it("does not turn a delegated Section into authority over site-wide interest groups", async () => {
    const interest = { ...sectionGroup, sectionId: null, programId: null };
    await expect(facilitatedGroup(transactionFor(interest), actor, interest.id))
      .rejects.toThrow("study group school/program grant");
    expect(authorizeClass).not.toHaveBeenCalled();
  });

  it("preserves legitimate Site-scoped facilitation for interest groups", async () => {
    const interest = { ...sectionGroup, sectionId: null, programId: null };
    const localActor: Actor = {
      ...actor, scope: { siteIds: ["site-a"], programIds: ["program-a"] },
    };
    await expect(facilitatedGroup(transactionFor(interest), localActor, interest.id))
      .resolves.toEqual(interest);
    expect(authorizeClass).not.toHaveBeenCalled();
  });
});
