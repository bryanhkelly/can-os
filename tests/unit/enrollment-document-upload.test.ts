import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrollmentDocumentUploads } from "@/components/enrollment/enrollment-document-upload";

const transport = vi.hoisted(() => ({ begin: vi.fn(), finish: vi.fn() }));
vi.mock("@/modules/enrollment/r2-document-upload.functions", () => ({
  beginEnrollmentDocumentUpload: transport.begin,
  finishEnrollmentDocumentUpload: transport.finish,
  getEnrollmentDocumentUploadAvailability: vi.fn(),
}));
const contract = { key: "private-document", uploadUrl: "https://private.invalid/put",
  uploadHeaders: { "Content-Type": "application/pdf" }, expiresInSeconds: 180 };
const file = new File(["deterministic isolated fixture"], "fixture.pdf", { type: "application/pdf" });
let put: ReturnType<typeof vi.fn>;
beforeEach(() => {
  transport.begin.mockReset().mockResolvedValue(contract);
  transport.finish.mockReset().mockResolvedValue(undefined);
  put = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", put);
});
afterEach(() => vi.unstubAllGlobals());

describe("shared enrollment document uploads", () => {
  it("retains completed bytes when finalization fails", async () => {
    transport.finish.mockRejectedValueOnce(new Error("finish unavailable"));
    const uploads = createEnrollmentDocumentUploads();
    await expect(uploads.upload("application", "requirement", file)).rejects.toThrow("finish unavailable");
    await uploads.upload("application", "requirement", file);
    expect(transport.begin).toHaveBeenCalledExactlyOnceWith({ data: {
      applicationId: "application", requirementId: "requirement",
      fileName: file.name, mimeType: file.type, size: file.size,
    } });
    expect(put).toHaveBeenCalledOnce();
    expect(transport.finish).toHaveBeenCalledTimes(2);
    expect(transport.finish).toHaveBeenLastCalledWith({ data: {
      applicationId: "application", requirementId: "requirement",
      fileName: file.name, mimeType: file.type, size: file.size, key: contract.key,
    } });
  });

  it("shares an in-flight task for duplicate submissions", async () => {
    const uploads = createEnrollmentDocumentUploads();
    await Promise.all([uploads.upload("a", "r", file), uploads.upload("a", "r", file)]);
    expect(transport.begin).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
    expect(transport.finish).toHaveBeenCalledOnce();
  });

  it("isolates sibling applications and requirement identities", async () => {
    const uploads = createEnrollmentDocumentUploads();
    transport.finish.mockRejectedValueOnce(new Error("retry first"));
    await expect(uploads.upload("a:b", "c", file)).rejects.toThrow();
    await uploads.upload("a", "b:c", file);
    await uploads.upload("a:b", "c", file);
    expect(transport.begin).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("starts a new attempt when the selected file changes", async () => {
    const uploads = createEnrollmentDocumentUploads();
    transport.finish.mockRejectedValueOnce(new Error("retry first"));
    await expect(uploads.upload("a", "r", file)).rejects.toThrow();
    const replacement = new File(["another isolated document"], "replacement.pdf", { type: file.type });
    await uploads.upload("a", "r", replacement);
    expect(put).toHaveBeenCalledTimes(2);
    expect(transport.begin).toHaveBeenLastCalledWith({ data: expect.objectContaining({ fileName: replacement.name }) });
  });

  it.each([0, 15, 10 * 1024 * 1024 + 1])("rejects %s bytes before calling domain or storage APIs", async size => {
    const invalid = new File([new Uint8Array(size)], "invalid.pdf", { type: file.type });
    await expect(createEnrollmentDocumentUploads().upload("a", "r", invalid)).rejects.toMatchObject({ uploadCode: "invalid-file" });
    expect(transport.begin).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
