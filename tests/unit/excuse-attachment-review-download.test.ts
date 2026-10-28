import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents } from "@/db/schema";
import { getExcuseAttachmentDownload } from "@/modules/learning/submission-attachments.functions";

const state = vi.hoisted(() => {
  const builder = (rows: unknown[]) => {
    const query: Record<string, unknown> = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => Promise.resolve(rows),
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  };
  return {
    actor: {
      role: "registrar",
      actorPersonId: "staff-1",
      accountId: "account-1",
      sessionId: "session-1",
      capabilities: new Set(["attendance.excuse.review"]),
      scope: { siteIds: ["site-1"], programIds: ["program-1"], organizationIds: ["org-1"] },
    } as Record<string, unknown>,
    results: [] as unknown[][],
    audit: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    builder,
  };
});

vi.mock("@/db/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => state.builder(state.results.shift() ?? []),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            state.audit.push({ table, values });
            return Promise.resolve(undefined);
          },
        }),
      }),
  },
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.actor,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (input: unknown) => input,
    validator(parse: (input: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@/platform/storage/r2", () => ({
  signPrivateObjectUrl: ({ key }: { key: string }) => "https://signed.example/" + key,
  verifyPrivateObject: vi.fn(),
}));

const attendanceEventId = "a1000000-0000-4000-8000-0000000000e1";
const documentId = "a1000000-0000-4000-8000-0000000000d1";
const storageKey = `learning/excuse/${attendanceEventId}/a1000000-0000-4000-8000-0000000000f1`;
const input = { attendanceEventId, documentId };

const eventRow = { siteId: "site-1", programId: "program-1", sectionId: "section-1" };
const hostRow = { organizationId: "org-1" };
const excuseRow = { documentIds: [documentId] };
const documentRow = { storageKey, verifiedAt: new Date() };

describe("getExcuseAttachmentDownload reviewer branch", () => {
  beforeEach(() => {
    state.results = [];
    state.audit = [];
    state.actor.role = "registrar";
    state.actor.actorPersonId = "staff-1";
    state.actor.capabilities = new Set(["attendance.excuse.review"]);
    state.actor.scope = { siteIds: ["site-1"], programIds: ["program-1"], organizationIds: ["org-1"] };
  });

  it("allows a scoped registrar and writes an audit row", async () => {
    state.results = [[eventRow], [hostRow], [excuseRow], [documentRow]];
    const result = await getExcuseAttachmentDownload({ data: input });
    expect(result).toEqual({
      downloadUrl: "https://signed.example/" + storageKey,
      expiresInSeconds: 60,
    });
    expect(state.audit).toHaveLength(1);
    expect(state.audit[0].table).toBe(auditEvents);
    expect(state.audit[0].values).toMatchObject({
      actorPersonId: "staff-1",
      action: "attendance.excuse.document.review_download",
      resourceType: "document",
      resourceId: documentId,
      scope: { siteId: "site-1", programId: "program-1" },
    });
  });

  it("allows a teacher assigned to the excuse's section", async () => {
    state.actor.role = "teacher";
    state.results = [[eventRow], [hostRow], [{ id: "st-1" }], [excuseRow], [documentRow]];
    await expect(getExcuseAttachmentDownload({ data: input })).resolves.toMatchObject({
      expiresInSeconds: 60,
    });
    expect(state.audit).toHaveLength(1);
  });

  it("denies a teacher without the section assignment", async () => {
    state.actor.role = "teacher";
    state.results = [[eventRow], [hostRow], []];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("teacher excuse section assignment");
    expect(state.audit).toHaveLength(0);
  });

  it("denies staff without the excuse review capability", async () => {
    state.actor.capabilities = new Set(["attendance.write"]);
    await expect(getExcuseAttachmentDownload({ data: input })).rejects.toThrow();
    expect(state.audit).toHaveLength(0);
  });

  it("denies roles outside teacher/registrar even with the capability", async () => {
    state.actor.role = "site_staff";
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("attendance excuse review grant");
    expect(state.audit).toHaveLength(0);
  });

  it("denies staff scoped to a different site", async () => {
    state.actor.scope = { siteIds: ["site-2"], programIds: ["program-1"], organizationIds: ["org-1"] };
    state.results = [[eventRow]];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("excuse review site and program scope");
    expect(state.audit).toHaveLength(0);
  });

  it("denies when the program belongs to another organization", async () => {
    state.results = [[eventRow], [{ organizationId: "org-2" }]];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("excuse review organization scope");
    expect(state.audit).toHaveLength(0);
  });

  it("denies a document that is not attached to an excuse for the event", async () => {
    state.results = [[eventRow], [hostRow], [{ documentIds: ["other-doc"] }]];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("document not attached");
    expect(state.audit).toHaveLength(0);
  });

  it("denies unverified or out-of-scope objects", async () => {
    state.results = [[eventRow], [hostRow], [excuseRow], [{ storageKey, verifiedAt: null }]];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("verified excuse document scope");
    state.results = [[eventRow], [hostRow], [excuseRow],
      [{ storageKey: "learning/excuse/other-event/x", verifiedAt: new Date() }]];
    await expect(getExcuseAttachmentDownload({ data: input }))
      .rejects.toThrow("verified excuse document scope");
    expect(state.audit).toHaveLength(0);
  });
});

describe("getExcuseAttachmentDownload guardian branch", () => {
  beforeEach(() => {
    state.results = [];
    state.audit = [];
    state.actor.role = "guardian";
    state.actor.actorPersonId = "guardian-1";
    state.actor.capabilities = new Set(["attendance.excuse.submit"]);
    state.actor.scope = { siteIds: ["site-1"], programIds: ["program-1"], organizationIds: ["org-1"] };
  });

  it("still serves the uploading guardian without a reviewer audit row", async () => {
    state.results = [
      [{ eventId: attendanceEventId, studentPersonId: "student-1" }],
      [{ id: "rel-1" }],
      [{ documentIds: [documentId] }],
      [documentRow],
    ];
    const result = await getExcuseAttachmentDownload({ data: input });
    expect(result.downloadUrl).toBe("https://signed.example/" + storageKey);
    expect(state.audit).toHaveLength(0);
  });
});
