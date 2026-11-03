import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBase64, downloadBlob } from "@/lib/download";

const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
const appendChild = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { appendChild } });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:isolated-download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared browser downloads", () => {
  it("downloads the supplied blob and releases its URL only after the click can be consumed", () => {
    const blob = new Blob(["fixture"], { type: "text/calendar;charset=utf-8" });
    downloadBlob(blob, "calendar.ics");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.href).toBe("blob:isolated-download");
    expect(anchor.download).toBe("calendar.ics");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:isolated-download");
  });

  it.each(["application/pdf", "application/zip"])("preserves binary bytes and %s MIME type", async contentType => {
    downloadBase64("AP+A", "fixture.bin", contentType);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    if (!(blob instanceof Blob)) throw new Error("Expected a Blob");
    expect(blob.type).toBe(contentType);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0, 255, 128]));
  });

  it("cleans up and propagates a failed click rather than reporting a download", () => {
    anchor.click.mockImplementationOnce(() => { throw new Error("download failed"); });
    expect(() => downloadBlob(new Blob(["fixture"]), "fixture.txt")).toThrow("download failed");
    expect(anchor.remove).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects malformed base64 before allocating a URL", () => {
    expect(() => downloadBase64("!invalid!", "fixture.pdf", "application/pdf")).toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
