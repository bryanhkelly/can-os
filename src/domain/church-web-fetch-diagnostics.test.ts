import { describe, expect, it } from "vitest";
import {
  ChurchWebFetchError, classifyChurchWebFetchFailure,
  describeChurchWebFetchFailure, summaryChurchWebFetchFailure,
} from "./church-web-fetch-diagnostics";

describe("safe private website extraction diagnostics", () => {
  it.each([
    ["Church website robots instructions prohibit collection", "robots_denied", "blocked"],
    ["Church website DNS did not resolve to exclusively public addresses", "unsafe_dns", "blocked"],
    ["Cross-origin church website redirects are unavailable", "redirect_rejected", "blocked"],
    ["Too many church website redirects", "redirect_rejected", "blocked"],
    ["Church website exceeded the bounded page limit", "response_too_large", "blocked"],
    ["Church website request timed out", "timed_out", "failed"],
    ["Unsupported or oversized church website response", "response_too_large", "blocked"],
    ["Church website did not return a public page", "response_rejected", "failed"],
    ["ECONNRESET at 169.254.169.254 user=private", "network_failure", "failed"],
  ] as const)("classifies %s safely as %s", (raw, expectedCode, expectedState) => {
    const result = classifyChurchWebFetchFailure(new Error(raw));
    expect(result.code).toBe(expectedCode);
    expect(result.state).toBe(expectedState);
    expect(result.message).not.toContain("169.254.");
    expect(result.message).not.toContain("user=private");
  });

  it("retains deterministic blocked reasons when all bounded candidates fail", () => {
    expect(summaryChurchWebFetchFailure(["no_usable_content", "robots_denied", "timed_out"]))
      .toBe("robots_denied");
    expect(summaryChurchWebFetchFailure([])).toBe("no_usable_content");
    expect(classifyChurchWebFetchFailure(new ChurchWebFetchError("unsafe_excerpt")))
      .toEqual(describeChurchWebFetchFailure("unsafe_excerpt"));
  });

  it("does not disclose arbitrary network exceptions to editor UI", () => {
    const input = new Error("Connection failed with secret session cookie=abcdef");
    const diagnosis = classifyChurchWebFetchFailure(input);
    expect(diagnosis.code).toBe("network_failure");
    expect(diagnosis.message).not.toMatch(/secret|cookie|abcdef/);
  });
});
