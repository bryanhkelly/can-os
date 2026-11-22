import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { MarketingPackagesV61 } from "@/components/launch-studio/MarketingPackagesV61";

const props = {
  siteId: "site-one",
  siteName: "Original Site",
  initial: [],
  suggestions: null,
  onExit: () => {},
};

describe("Marketing Package editor session isolation", () => {
  it("preserves the editor while the same Site and module rerender", () => {
    const first = MarketingPackagesV61(props);
    const second = MarketingPackagesV61({ ...props, siteName: "Updated Site" });
    expect(isValidElement(first)).toBe(true);
    expect(first.type).toBe(second.type);
    expect(first.key).toBe("site-one:create-outreach");
    expect(first.key).toBe(second.key);
  });

  it("remounts all editing, draft and release state on a Site change", () => {
    const previous = MarketingPackagesV61(props);
    const next = MarketingPackagesV61({ ...props, siteId: "site-two", siteName: "Other Site" });
    expect(previous.type).toBe(next.type);
    expect(next.key).toBe("site-two:create-outreach");
    expect(next.key).not.toBe(previous.key);
  });

  it("remounts when changing Introduce workflows without copying working drafts", () => {
    const promote = MarketingPackagesV61({ ...props, module: "promote" });
    const recruit = MarketingPackagesV61({ ...props, module: "recruit" });
    const events = MarketingPackagesV61({ ...props, module: "interest-events" });
    expect(promote.key).toBe("site-one:promote");
    expect(recruit.key).toBe("site-one:recruit");
    expect(events.key).toBe("site-one:interest-events");
  });
});
