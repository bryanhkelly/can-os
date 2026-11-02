import { describe, expect, it, vi } from "vitest";
import { encodeCommonCartridge } from "./common-cartridge-encoding";

describe("encodeCommonCartridge", () => {
  it("rejects an oversized package before accessing its contents", async () => {
    const arrayBuffer = vi.fn();
    const file = { size: 2_000_001, arrayBuffer } as unknown as File;
    await expect(encodeCommonCartridge(file)).rejects.toThrow("2 MB or smaller");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("encodes an empty package", async () => {
    const file = { size: 0, arrayBuffer: async () => new ArrayBuffer(0) } as File;
    expect(await encodeCommonCartridge(file)).toBe("");
  });
});
