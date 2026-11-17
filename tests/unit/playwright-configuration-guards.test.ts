import { describe, expect, it } from "vitest";
import { requireLocalHttpUrl, requirePinnedReleaseUrl } from "../e2e/config/guards";

const SHA = "a".repeat(40);

describe("Playwright profile boundary guards", () => {
  it("rejects remote and HTTPS destinations for local-only tests", () => {
    expect(requireLocalHttpUrl("http://localhost:3191", "local").port).toBe("3191");
    expect(() => requireLocalHttpUrl("https://can-os.example.test", "local")).toThrow();
    expect(() => requireLocalHttpUrl("http://can-os.example.test", "local")).toThrow();
  });
  it("requires an exact deployed release SHA and secure transport", () => {
    expect(requirePinnedReleaseUrl({
      baseURL: "https://preview.example.test", sourceSha: SHA, deployedSha: SHA, profile: "release",
    }).hostname).toBe("preview.example.test");
    expect(() => requirePinnedReleaseUrl({
      baseURL: "https://preview.example.test", sourceSha: SHA, deployedSha: "b".repeat(40), profile: "release",
    })).toThrow(/matching/);
    expect(() => requirePinnedReleaseUrl({
      baseURL: "http://preview.example.test", sourceSha: SHA, deployedSha: SHA, profile: "release",
    })).toThrow(/HTTPS/);
  });
});
