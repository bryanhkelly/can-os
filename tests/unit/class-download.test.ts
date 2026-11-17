import { afterEach, describe, expect, it, vi } from "vitest";
import { openClassDownload } from "../../src/lib/class-download";

afterEach(() => vi.unstubAllGlobals());

describe("class resource downloads", () => {
  it("uses a download anchor in a separate tab instead of navigating the SPA", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = { href: "", download: "unset", target: "", rel: "", click, remove };
    vi.stubGlobal("window", { location: { href: "https://can-os.test/classes", origin: "https://can-os.test" } });
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { appendChild } });

    openClassDownload("https://storage.example.test/signed/file?token=test");
    expect(anchor.href).toBe("https://storage.example.test/signed/file?token=test");
    expect(anchor.download).toBe("");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toContain("noopener");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTTP(S) URLs and cross-origin insecure links", () => {
    const createElement = vi.fn();
    vi.stubGlobal("window", { location: { href: "https://can-os.test/classes", origin: "https://can-os.test" } });
    vi.stubGlobal("document", { createElement });
    expect(() => openClassDownload("javascript:alert(1)")).toThrow();
    expect(() => openClassDownload("http://outside.example.test/resource")).toThrow();
    expect(createElement).not.toHaveBeenCalled();
  });
});
