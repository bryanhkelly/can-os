import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";

const key = "learning/assignment/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
const keyPattern = /^learning\/assignment\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
const fetchMock = vi.fn<typeof fetch>();
const signature = new Uint8Array(16);
signature.set(new TextEncoder().encode("%PDF-1.7"));

beforeEach(() => {
  vi.stubEnv("CAN_R2_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("CAN_R2_BUCKET", "test-private");
  vi.stubEnv("CAN_R2_ACCESS_KEY_ID", "test-access");
  vi.stubEnv("CAN_R2_SECRET_ACCESS_KEY", "test-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function head(size = "32", contentType = "application/pdf") {
  return new Response(null, { headers: { "content-length": size, "content-type": contentType } });
}
function sample(bytes = signature) {
  return new Response(bytes, {
    status: 206, headers: { "content-range": "bytes 0-15/32", "content-length": "16" },
  });
}
function verify() {
  return verifyPrivateObject({
    key, keyPattern, expectedSize: 32, expectedContentType: "application/pdf",
    verifySignature: matchesEnrollmentDocumentSignature,
  });
}

describe("shared private object storage", () => {
  it("enforces each domain key scope and integer URL expiry", () => {
    expect(new URL(signPrivateObjectUrl({ method: "GET", key, keyPattern })).pathname).toContain(key);
    for (const expiresSeconds of [0, 901, NaN, Infinity, 1.5]) {
      expect(() => signPrivateObjectUrl({ method: "GET", key, keyPattern, expiresSeconds })).toThrow();
    }
    expect(() => signPrivateObjectUrl({ method: "GET", key: "enrollment/other", keyPattern })).toThrow();
  });

  it("verifies declared size, MIME, range, and file signature with a bounded read", async () => {
    fetchMock.mockResolvedValueOnce(head()).mockResolvedValueOnce(sample());
    await expect(verify()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({ headers: { Range: "bytes=0-15" } });
  });

  it.each([head("31"), head("32", "image/png"), head("32", "")])(
    "rejects missing or mismatched object metadata before reading content", async response => {
      fetchMock.mockResolvedValueOnce(response);
      await expect(verify()).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects storage that ignores the byte range", async () => {
    fetchMock.mockResolvedValueOnce(head()).mockResolvedValueOnce(new Response(signature));
    await expect(verify()).rejects.toThrow("bounded signature");
  });

  it.each([new Uint8Array(15), new Uint8Array(17), new Uint8Array(16)])(
    "rejects short, oversized, or invalid signature bodies", async bytes => {
      fetchMock.mockResolvedValueOnce(head()).mockResolvedValueOnce(sample(bytes));
      await expect(verify()).rejects.toThrow();
    },
  );
});
