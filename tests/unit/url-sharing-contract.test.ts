import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("Site link sharing integration contracts", () => {
  it("uses the same typed builder and copy component from Launch and outreach", () => {
    const frame = read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    const go = read("src/components/launch-studio/GoLinkWorkspace.tsx");
    const sharing = read("src/components/launch-studio/SiteLinkSharing.tsx");
    expect(frame).toContain("<SiteLinkSharing");
    expect(go).toContain("<GoLinkActions");
    expect(read("src/components/links/GoLinkActions.tsx")).toContain("<CopyLinkButton");
    expect(read("src/components/launch-studio/LaunchPreviewSharing.tsx")).toContain("<GoLinkActions");
    expect(sharing).toContain("buildUrlDestination");
    expect(sharing).toContain("Private Site workspace");
    expect(sharing).toContain("Revocable outreach / Go link");
    expect(sharing).toContain("publishedHost");
  });
  it("does not publish a draft or pretend a private preview is an ordinary copy link", () => {
    const launch = read("src/routes/launch.site.tsx");
    expect(launch).toContain('site.websiteDraft?.status === "published"');
    const sharing = read("src/components/launch-studio/SiteLinkSharing.tsx");
    expect(sharing).toContain("Not available until this Site website is officially published");
    expect(sharing).toContain("separate Share preview control");
    const copy = read("src/components/links/CopyLinkButton.tsx");
    expect(copy).toContain("type UrlDestination");
  });
});
