import { describe, expect, it } from "vitest";
import { LaunchReadinessPanelV61 } from "@/components/launch-studio/LaunchReadinessPanelV61";

describe("Launch readiness session scope", () => {
  it("keeps one reader session for repeated renders of the same Site and stage", () => {
    const first = LaunchReadinessPanelV61({ siteId: "site-one", context: "prepare" });
    const next = LaunchReadinessPanelV61({ siteId: "site-one", context: "prepare" });
    expect(first.key).toBe("site-one:prepare");
    expect(first.key).toBe(next.key);
    expect(first.type).toBe(next.type);
  });

  it("discards previous Site evidence and stage-specific status on context changes", () => {
    const original = LaunchReadinessPanelV61({ siteId: "site-one", context: "prepare" });
    const otherSite = LaunchReadinessPanelV61({ siteId: "site-two", context: "prepare" });
    const open = LaunchReadinessPanelV61({ siteId: "site-one", context: "open" });
    expect(otherSite.key).toBe("site-two:prepare");
    expect(open.key).toBe("site-one:open");
    expect(otherSite.key).not.toBe(original.key);
    expect(open.key).not.toBe(original.key);
  });
});
