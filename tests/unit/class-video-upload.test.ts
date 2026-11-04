import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), authorize: vi.fn(), verify: vi.fn(), sign: vi.fn(),
  upload: vi.fn(), audit: vi.fn(), event: vi.fn(), execute: vi.fn(),
  selections: [] as unknown[][], inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  selected: [] as unknown[], transactions: 0,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (parse: (value: unknown) => unknown) => ({
      handler: (handler: (arg: { data: unknown }) => unknown) => async (arg: { data: unknown }) => handler({ data: parse(arg.data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/actors.server", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/modules/learning/class-video-access.server", () => ({ authorizeClassVideoManager: mocks.authorize }));
vi.mock("@/platform/mutation", () => ({ writeAudit: mocks.audit, emitEvent: mocks.event }));
vi.mock("@/platform/storage/r2", () => ({
  resolveR2Config: vi.fn(), verifyPrivateObject: mocks.verify,
  createPrivateUpload: mocks.upload, signPrivateObjectUrl: mocks.sign,
}));
vi.mock("@/db/client", () => {
  const query = {
    select: (selection: unknown) => {
      mocks.selected.push(selection);
      const rows = mocks.selections.shift() ?? [];
      const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: async () => rows };
      return chain;
    },
    execute: mocks.execute,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserts.push({ table, values });
        return { returning: async () => [{ id: values.subjectType ? "document-id" : "overlay-id" }] };
      },
    }),
  };
  return { db: { ...query, transaction: async (run: (tx: typeof query) => Promise<unknown>) => {
    mocks.transactions++;
    return run(query);
  } } };
});

import { beginClassVideoUpload, finishClassVideoUpload, getStaffClassVideoOptions, getStaffClassVideoPreview } from "@/modules/learning/class-video-upload.functions";
import { classVideoKey, classVideoKeyPattern } from "@/domain/class-video";
import { AuthorizationError } from "@/domain/command-context";
import { curriculumOverlays, curriculumResources, documents } from "@/db/schema";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = { actorPersonId: id(1), role: "teacher" };
const section = { id: id(2), programId: id(3), siteId: id(4), versionId: id(5), contentStatus: "published",
  curriculum: { learning: { version: 1, modules: [{ id: "unit", title: "Unit", lessons: [
    { id: "lesson", title: "Lesson", body: "Reading", resources: [] },
  ] }], resources: [] } } };
const input = { sectionId: section.id, title: "Lesson video", lessonId: "lesson",
  fileName: "lesson.mp4", contentType: "video/mp4" as const, size: 100 };
const final = { ...input, resourceId: id(6), key: classVideoKey(actor.actorPersonId, section.id, section.versionId, id(6)),
  acknowledgedRights: true as const };

beforeEach(() => {
  vi.clearAllMocks(); mocks.selections = []; mocks.inserts = []; mocks.selected = []; mocks.transactions = 0;
  vi.stubEnv("CAN_R2_CURRICULUM_UPLOADS_ENABLED", "true");
  mocks.requireActor.mockResolvedValue(actor); mocks.authorize.mockResolvedValue(section);
  mocks.upload.mockImplementation(options => ({ key: options.key, uploadUrl: "https://private.test/upload",
    uploadHeaders: { "Content-Type": options.contentType, "If-None-Match": "*" }, expiresInSeconds: options.expiresSeconds }));
  mocks.verify.mockResolvedValue(undefined); mocks.sign.mockReturnValue("https://private.test/video");
  mocks.audit.mockResolvedValue(undefined); mocks.event.mockResolvedValue(undefined);
});

describe("class video upload commands", () => {
  it("requests only teacher or registrar identities and signs one immutable bounded object", async () => {
    const result = await beginClassVideoUpload({ data: input });
    expect(mocks.requireActor).toHaveBeenCalledWith(["teacher", "registrar"]);
    expect(mocks.authorize).toHaveBeenCalledWith(actor, section.id);
    expect(result.key).toBe(classVideoKey(actor.actorPersonId, section.id, section.versionId, result.resourceId));
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({
      keyPattern: classVideoKeyPattern, maxContentLength: 524288000, contentLength: 100,
      contentType: "video/mp4", preventOverwrite: true, expiresSeconds: 900,
    }));
    expect(mocks.inserts).toHaveLength(0);
  });
  it("fails closed when the deployment gate is disabled", async () => {
    vi.stubEnv("CAN_R2_CURRICULUM_UPLOADS_ENABLED", "false");
    await expect(beginClassVideoUpload({ data: input })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects unauthorized students and staff before signing", async () => {
    mocks.requireActor.mockRejectedValue(new AuthorizationError("role denied"));
    await expect(beginClassVideoUpload({ data: input })).rejects.toThrow("role denied");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects unpublished courses and unknown lesson IDs", async () => {
    mocks.authorize.mockResolvedValueOnce({ ...section, contentStatus: "draft" });
    await expect(beginClassVideoUpload({ data: input })).rejects.toThrow();
    await expect(beginClassVideoUpload({ data: { ...input, lessonId: "foreign-lesson" } })).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects oversized or mismatched files and missing sharing rights", async () => {
    await expect(beginClassVideoUpload({ data: { ...input, size: 524288001 } })).rejects.toThrow();
    await expect(beginClassVideoUpload({ data: { ...input, fileName: "video.html" } })).rejects.toThrow();
    await expect(finishClassVideoUpload({ data: { ...final, acknowledgedRights: false } })).rejects.toThrow();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it.each([
    classVideoKey(id(7), section.id, section.versionId, id(6)),
    classVideoKey(actor.actorPersonId, id(7), section.versionId, id(6)),
    classVideoKey(actor.actorPersonId, section.id, id(7), id(6)),
    classVideoKey(actor.actorPersonId, section.id, section.versionId, id(7)),
  ])("rejects cross-uploader, class, version or resource keys", async key => {
    await expect(finishClassVideoUpload({ data: { ...final, key } })).rejects.toThrow();
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.transactions).toBe(0);
  });
  it("does not finalize an object that fails storage verification", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("size or signature mismatch"));
    await expect(finishClassVideoUpload({ data: final })).rejects.toThrow("size or signature mismatch");
    expect(mocks.transactions).toBe(0); expect(mocks.inserts).toHaveLength(0);
  });
  it("rechecks authority after object verification and inside the mutation transaction", async () => {
    mocks.authorize.mockResolvedValueOnce(section).mockRejectedValueOnce(new AuthorizationError("revoked assignment"));
    await expect(finishClassVideoUpload({ data: final })).rejects.toThrow("revoked assignment");
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.authorize.mock.calls[1]?.[2]).toBeDefined();
    expect(mocks.inserts).toHaveLength(0);
  });
  it("rejects a changed pinned course version", async () => {
    mocks.authorize.mockResolvedValueOnce(section).mockResolvedValueOnce({ ...section, versionId: id(7) });
    await expect(finishClassVideoUpload({ data: final })).rejects.toThrow();
    expect(mocks.inserts).toHaveLength(0);
  });
  it.each(["teacher", "registrar", "site_admin"])("records %s uploads and evidence in the same transaction", async role => {
    mocks.requireActor.mockResolvedValue({ ...actor, role });
    mocks.selections = [[], [{ organizationId: id(8), siteId: section.siteId }]];
    expect(await finishClassVideoUpload({ data: final })).toEqual({ supplementId: "overlay-id" });
    expect(mocks.inserts.map(row => row.table)).toEqual([documents, curriculumResources, curriculumOverlays]);
    expect(mocks.inserts[0]?.values).toMatchObject({ storageKey: final.key, mimeType: "video/mp4", uploadedByPersonId: actor.actorPersonId });
    expect(mocks.inserts[2]?.values).toMatchObject({ sectionId: section.id, lessonId: "lesson",
      metadata: { source: role === "teacher" ? "teacher_supplement" : "school_upload", publisherContentModified: false } });
    const tx = mocks.authorize.mock.calls[1]?.[2];
    expect(mocks.audit.mock.calls[0]?.[0]).toBe(tx);
    expect(mocks.event.mock.calls[0]?.[0]).toBe(tx);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("reuses a previously finalized upload without duplicate writes or events", async () => {
    mocks.selections = [[{ id: "existing-overlay", title: final.title, lessonId: final.lessonId,
      versionId: section.versionId, status: "active", key: final.key, fileName: final.fileName,
      type: final.contentType, metadata: { size: final.size } }]];
    expect(await finishClassVideoUpload({ data: final })).toEqual({ supplementId: "existing-overlay" });
    expect(mocks.inserts).toHaveLength(0); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled();
  });
  it("rejects a conflicting or retired finalization retry", async () => {
    mocks.selections = [[{ id: "existing-overlay", title: "Different video", status: "retired" }]];
    await expect(finishClassVideoUpload({ data: final })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.inserts).toHaveLength(0); expect(mocks.event).not.toHaveBeenCalled();
  });
  it("does not swallow an outbox failure or claim success", async () => {
    mocks.selections = [[], [{ organizationId: id(8), siteId: section.siteId }]];
    mocks.event.mockRejectedValueOnce(new Error("outbox failed"));
    await expect(finishClassVideoUpload({ data: final })).rejects.toThrow("outbox failed");
  });
});

describe("staff preview", () => {
  it("returns published lesson choices only after scoped staff authorization", async () => {
    expect(await getStaffClassVideoOptions({ data: { sectionId: section.id } })).toEqual({
      enabled: true, lessons: [{ id: "lesson", title: "Lesson" }],
    });
    expect(mocks.requireActor).toHaveBeenCalledWith(["registrar"]);
  });
  it("signs a verified private video for an authorized curriculum manager", async () => {
    mocks.requireActor.mockResolvedValue({ ...actor, role: "site_admin" });
    mocks.selections = [[{ key: final.key, type: "video/mp4", uploader: actor.actorPersonId, resourceId: id(6) }]];
    expect(await getStaffClassVideoPreview({ data: { sectionId: section.id, supplementId: id(9) } }))
      .toEqual({ downloadUrl: "https://private.test/video" });
    expect(mocks.sign).toHaveBeenCalledWith({ method: "GET", key: final.key, keyPattern: classVideoKeyPattern, expiresSeconds: 900 });
  });
  it.each([[], [{ key: final.key, type: "text/html", uploader: actor.actorPersonId, resourceId: id(6) }],
    [{ key: classVideoKey(actor.actorPersonId,id(7),section.versionId,id(6)), type: "video/mp4", uploader: actor.actorPersonId, resourceId: id(6) }]])("refuses missing, wrong-format or cross-class documents", async rows => {
    mocks.requireActor.mockResolvedValue({ ...actor, role: "registrar" });
    mocks.selections = [rows];
    await expect(getStaffClassVideoPreview({ data: { sectionId: section.id, supplementId: id(9) } })).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
