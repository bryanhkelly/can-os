import { describe, expect, it } from "vitest";
import { unambiguousInstant } from "./launch-orientation-time";

describe("launch orientation time conversion", () => {
  it("converts an ordinary site-local time to UTC", () => {
    expect(unambiguousInstant("2026-10-20T18:00", "America/Los_Angeles")).toBe("2026-10-21T01:00:00.000Z");
  });

  it("rejects nonexistent spring-forward local times", () => {
    expect(() => unambiguousInstant("2026-03-08T02:30", "America/Los_Angeles")).toThrow();
  });

  it("rejects repeated fall-back local times", () => {
    expect(() => unambiguousInstant("2026-11-01T01:30", "America/Los_Angeles")).toThrow(/ambiguous/);
  });

  it("converts valid times immediately after the fall transition", () => {
    expect(unambiguousInstant("2026-11-01T02:30", "America/Los_Angeles")).toBe("2026-11-01T10:30:00.000Z");
  });
});
