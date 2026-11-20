import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LaunchSitePublicationPanel } from "@/components/launch-studio/LaunchSitePublicationPanel";
import type { readLaunchSitePublication } from "@/modules/sites/launch-site-publication.functions";

type Publication = Awaited<ReturnType<typeof readLaunchSitePublication>>;
const state = vi.hoisted(() => ({
  snapshot: null as { siteId: string; value: unknown } | null,
  hookIndex: 0,
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
vi.mock("@/modules/sites/launch-site-publication.functions", () => ({
  readLaunchSitePublication: vi.fn(), reviewLaunchSiteWebsiteCopy: vi.fn(),
}));
vi.mock("@/modules/sites/site-publication.functions", () => ({
  setSitePublicationStatus: vi.fn(), verifySitePublicationReachability: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const [value, setValue] = actual.useState(initial);
      const index = state.hookIndex++;
      // Seed the first hook (publication snapshot) and mark the initial
      // request as complete without invoking network effects during SSR.
      return [index === 0 ? state.snapshot as T
        : index === 3 ? false as T : value, setValue] as const;
    },
  };
});

const publication = {
  siteName: "Confidential Original Site",
  address: null,
  approvedAcademicCount: 0,
  approvedEnrichmentCount: 0,
  hostingConfigured: false,
  reviewedLocalContentAvailable: false,
  latestWebsiteStatus: "review_required",
  latestWebsiteRevision: 1,
  canReviewWebsiteCopy: false,
  canPublishSite: false,
  publishingPrerequisitesPresent: false,
  canRepublish: false,
} as unknown as Publication;

function render(siteId: string) {
  state.hookIndex = 0;
  return renderToStaticMarkup(<LaunchSitePublicationPanel siteId={siteId} />);
}

beforeEach(() => {
  state.snapshot = { siteId: "original-site", value: publication };
  state.hookIndex = 0;
});

describe("Site publication scope isolation", () => {
  it("shows the authorized site's public identity", () => {
    expect(render("original-site")).toContain("Confidential Original Site");
  });
  it("hides the previous site's private publication state before effects run", () => {
    const html = render("other-site");
    expect(html).not.toContain("Confidential Original Site");
    expect(html).not.toContain("Website revision 1");
    expect(html).toContain("Checking your Site publication authorization");
  });
});
