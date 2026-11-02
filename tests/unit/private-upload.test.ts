import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPrivateUploadCors, attachmentContentType, photoMimeTypes, PrivateUploadCompletion, uploadPrivateFile,
  validateUploadFile, type PrivateUpload,
} from "@/platform/storage/private-upload";

afterEach(() => vi.unstubAllGlobals());

const uploadContract: PrivateUpload = {
  objectKey: "test/object",
  uploadUrl: "https://storage.example/upload",
  uploadHeaders: { "Content-Type": "application/pdf" },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("common private upload client", () => {
  it.each([false, true])("uses server headers without rebuilding them (conditional=%s)", async conditional => {
    const uploadHeaders = { "Content-Type": "application/pdf", ...(conditional ? { "If-None-Match": "*" } : {}) };
    const file = new File(["%PDF-1.7 synthetic fixture"], "evidence.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadPrivateFile(file, { ...uploadContract, uploadHeaders });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://storage.example/upload", {
      method: "PUT", headers: uploadHeaders, body: file, credentials: "omit", signal: undefined,
    });
  });

  it.each([403, 412, 500])("surfaces safe feedback for HTTP %s without retrying an unsafe upload", async status => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadPrivateFile(new File(["test"], "test.pdf"), {
      ...uploadContract, uploadHeaders: { "If-None-Match": "*" },
    })).rejects.toMatchObject({
      code: status === 403 ? "FORBIDDEN" : status === 412 ? "CONFLICT" : "UNEXPECTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports network/CORS errors without disclosing the presigned URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(uploadPrivateFile(new File(["test"], "test.pdf"), {
      ...uploadContract, uploadUrl: "https://storage.example/upload?secret=signature", uploadHeaders: {},
    })).rejects.toThrow("File upload could not reach storage.");
  });

  it("supports cancellation without disguising an abort as a storage error", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = uploadPrivateFile(new File(["test"], "test.pdf"), uploadContract, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(uploadContract.uploadUrl, expect.objectContaining({ signal: controller.signal }));
  });

  it("refuses an expired upload authorization before sending the file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadPrivateFile(new File(["test"], "test.pdf"), {
      ...uploadContract, expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })).rejects.toThrow("authorization has expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains a successfully stored object when completion needs a retry", async () => {
    const file = new File(["%PDF-1.7 synthetic fixture"], "evidence.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const completion = new PrivateUploadCompletion<PrivateUpload>();
    const begin = vi.fn().mockResolvedValue(uploadContract);
    const finish = vi.fn().mockRejectedValueOnce(new Error("finish unavailable")).mockResolvedValue("done");

    await expect(completion.run(file, begin, finish)).rejects.toThrow("finish unavailable");
    expect(completion.hasPendingCompletion).toBe(true);
    await expect(completion.run(file, begin, finish)).resolves.toBe("done");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(completion.hasPendingCompletion).toBe(false);
  });

  it("checks actual R2 preflight support for every required upload header", () => {
    const origin = "https://school.example";
    const headers = new Headers({
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, PUT",
      "access-control-allow-headers": "content-type, If-None-Match",
    });
    expect(() => assertPrivateUploadCors(new Response(null, { status: 204, headers }), origin,
      ["Content-Type", "If-None-Match"])).not.toThrow();
    expect(() => assertPrivateUploadCors(new Response(null, { status: 204, headers }), origin,
      ["Content-Type", "x-required"])).toThrow("missing required upload headers: x-required");
    expect(() => assertPrivateUploadCors(new Response(null, { status: 204, headers }), "https://other.example",
      ["Content-Type"])).toThrow("configured application origin");
    const wildcardOrigin = new Headers(headers);
    wildcardOrigin.set("access-control-allow-origin", "*");
    expect(() => assertPrivateUploadCors(new Response(null, { status: 204, headers: wildcardOrigin }), origin,
      ["Content-Type"])).toThrow("configured application origin");
    expect(() => assertPrivateUploadCors(new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin, "access-control-allow-methods": "GET",
      "access-control-allow-headers": "content-type",
    } }), origin, ["Content-Type"])).toThrow("does not allow PUT");
  });

  it.each(["application/pdf", "image/png", "image/jpeg"])("accepts supported document MIME %s at exact size bounds", type => {
    expect(() => validateUploadFile({ size: 16 }, type)).not.toThrow();
    expect(() => validateUploadFile({ size: 10 * 1024 * 1024 }, type)).not.toThrow();
  });
  it.each([0, 15, 16.5, NaN, Infinity, 10 * 1024 * 1024 + 1])("rejects invalid document size %s", size => {
    expect(() => validateUploadFile({ size }, "application/pdf")).toThrow();
  });
  it("preserves the stricter photo policy", () => {
    expect(() => validateUploadFile({ size: 16 }, "application/pdf", photoMimeTypes, 2 * 1024 * 1024)).toThrow();
    expect(() => validateUploadFile({ size: 2 * 1024 * 1024 + 1 }, "image/png", photoMimeTypes, 2 * 1024 * 1024)).toThrow();
    expect(() => validateUploadFile({ size: 2 * 1024 * 1024 }, "image/jpeg", photoMimeTypes, 2 * 1024 * 1024)).not.toThrow();
    expect(() => validateUploadFile({ size: 16 }, "image/svg+xml")).toThrow();
  });
  it.each([
    ["test.PDF", "application/pdf"], ["test.png", "image/png"],
    ["test.JPG", "image/jpeg"], ["test.jpeg", "image/jpeg"],
  ])("resolves attachment extensions consistently: %s", (name, type) => {
    expect(attachmentContentType(name)).toBe(type);
  });
  it("does not default unsupported attachments to an accepted type", () => {
    expect(() => attachmentContentType("test.svg")).toThrow("Unsupported file type");
    expect(() => attachmentContentType("no-extension")).toThrow("Unsupported file type");
  });
});
