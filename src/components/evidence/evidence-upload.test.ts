import { afterEach, describe, expect, it, vi } from "vitest";
import { submitEvidenceUpload, type PendingEvidenceUpload } from "./evidence-upload";
type Input = { fileName: string; mimeType: "application/pdf"; size: number; expiresAt: string };
const file = new File(["evidence"], "evidence.pdf", { type: "application/pdf" });
const makeInput = (selected: File, expiresAt: string): Input =>
  ({ fileName: selected.name, mimeType: "application/pdf", size: selected.size, expiresAt });
afterEach(() => vi.unstubAllGlobals());

describe("private evidence upload retry contract", () => {
  it("records the exact uploaded key on successful finalization", async () => {
    const begin = vi.fn(async () => ({ key: "private-key", uploadUrl: "/signed", uploadHeaders: {} }));
    const finish = vi.fn(async (_input: Input & { key: string }) => {});
    const upload = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", upload);
    await submitEvidenceUpload({ begin, finish }, makeInput, file, "2027-05-01", null, () => {});
    expect(begin).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ key: "private-key", fileName: "evidence.pdf" }));
  });
  it("retries only finalization when the first finalization fails", async () => {
    const begin = vi.fn(async () => ({ key: "private-key", uploadUrl: "/signed", uploadHeaders: {} }));
    const finish = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(undefined);
    const upload = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", upload);
    let pending: PendingEvidenceUpload<Input> | null = null;
    const save = (attempt: PendingEvidenceUpload<Input>) => { pending = attempt; };
    await expect(submitEvidenceUpload({ begin, finish }, makeInput, file, "2027-05-01", pending, save))
      .rejects.toThrow("temporary");
    await submitEvidenceUpload({ begin, finish }, makeInput, file, "2027-05-01", pending, save);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(2);
  });
  it("never finalizes when private byte upload fails", async () => {
    const begin = vi.fn(async () => ({ key: "private-key", uploadUrl: "/signed", uploadHeaders: {} }));
    const finish = vi.fn(async () => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(submitEvidenceUpload({ begin, finish }, makeInput, file, "2027-05-01", null, () => {}))
      .rejects.toThrow("Private upload failed");
    expect(finish).not.toHaveBeenCalled();
  });
  it("rejects unsupported file types before requesting a signed URL", async () => {
    const begin = vi.fn(async () => ({ key: "k", uploadUrl: "/signed", uploadHeaders: {} }));
    const finish = vi.fn(async () => {});
    const invalid = new File(["text"], "bad.txt", { type: "text/plain" });
    await expect(submitEvidenceUpload({ begin, finish }, makeInput, invalid, "2027-05-01", null, () => {}))
      .rejects.toThrow("Only PDF");
    expect(begin).not.toHaveBeenCalled();
  });
});
