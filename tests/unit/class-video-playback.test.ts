import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), authorize: vi.fn(), sign: vi.fn(), headers: vi.fn(), entry: null as unknown }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (parse: (value: unknown) => unknown) => ({
      handler: (handler: (arg: { data: unknown }) => unknown) => async (arg: { data: unknown }) => handler({ data: parse(arg.data) }),
    }),
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: mocks.headers }));
vi.mock("@/modules/learning/class-access.server", () => ({ classActor: mocks.actor, authorizeClass: mocks.authorize, accessibleClasses: vi.fn() }));
vi.mock("@/platform/storage/r2", () => ({ signPrivateObjectUrl: mocks.sign }));
vi.mock("@/db/client", () => {
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain,
    limit: async () => mocks.entry ? [mocks.entry] : [] };
  return { db: { select: () => chain } };
});
import { getClassSupplementDownload } from "@/modules/learning/class-workspace.functions";
import { classVideoKey, classVideoKeyPattern } from "@/domain/class-video";
import { AuthorizationError } from "@/domain/command-context";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const section = { id: id(1), programId: id(2), siteId: id(3), versionId: id(4), contentStatus: "published" };
const video = { overlay: { sectionId: section.id, siteId: section.siteId }, resourceId: id(5),
  resourceKind: "video", uploader: id(6), docType: "video/mp4",
  docKey: classVideoKey(id(6), section.id, section.versionId, id(5)) };
const input = { sectionId: section.id, supplementId: id(7) };
beforeEach(() => {
  vi.clearAllMocks(); mocks.entry = video;
  mocks.actor.mockResolvedValue({ role: "student", actorPersonId: id(8) });
  mocks.authorize.mockResolvedValue({ section });
  mocks.sign.mockReturnValue("https://private.test/signed-video");
});
describe("private student class video playback", () => {
  it("reauthorizes class access before issuing a bounded playback URL without storage keys", async () => {
    const result = await getClassSupplementDownload({ data: input });
    expect(result).toEqual({ downloadUrl: "https://private.test/signed-video" });
    expect(mocks.authorize).toHaveBeenCalledWith({ role: "student", actorPersonId: id(8) }, section.id, undefined);
    expect(mocks.sign).toHaveBeenCalledWith({
      method: "GET", key: video.docKey, keyPattern: classVideoKeyPattern, expiresSeconds: 900,
    });
    expect(mocks.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(result).not.toHaveProperty("key");
  });
  it("passes the exact child identity through existing guardian relationship checks", async () => {
    mocks.actor.mockResolvedValue({ role: "guardian", actorPersonId: id(9) });
    await getClassSupplementDownload({ data: { ...input, studentPersonId: id(8) } });
    expect(mocks.authorize).toHaveBeenCalledWith({ role: "guardian", actorPersonId: id(9) }, section.id, id(8));
  });
  it("denies playback after enrollment or class authorization is revoked", async () => {
    mocks.authorize.mockRejectedValueOnce(new AuthorizationError("revoked enrollment"));
    await expect(getClassSupplementDownload({ data: input })).rejects.toThrow("revoked enrollment");
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("denies unpublished course access", async () => {
    mocks.authorize.mockResolvedValueOnce({ section: { ...section, contentStatus: "draft" } });
    await expect(getClassSupplementDownload({ data: input })).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...video, docType: "text/html" },
    { ...video, uploader: null },
    { ...video, overlay: { ...video.overlay, sectionId: id(9) } },
    { ...video, overlay: { ...video.overlay, siteId: id(9) } },
    { ...video, docKey: classVideoKey(id(6), id(9), section.versionId, id(5)) },
    { ...video, docKey: classVideoKey(id(6), section.id, id(9), id(5)) },
    { ...video, docKey: classVideoKey(id(9), section.id, section.versionId, id(5)) },
  ])("rejects unavailable, mismatched or wrong-type private video %j", async entry => {
    mocks.entry = entry;
    await expect(getClassSupplementDownload({ data: input })).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("preserves the existing short-lived private PDF download behavior", async () => {
    const key = `learning/supplements/${id(5)}/${id(9)}`;
    mocks.entry = { ...video, resourceKind: "pdf", docType: "application/pdf", docKey: key };
    await getClassSupplementDownload({ data: input });
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ key, expiresSeconds: 60 }));
  });
});
