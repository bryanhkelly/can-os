import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Launch Studio Prepare publication authorization projection", () => {
  const prepare = source("src/modules/sites/launch-site-publication.functions.ts");
  const publisher = source("src/modules/sites/site-publication.server.ts");
  const localEditor = source("src/modules/sites/site-website-authorization.server.ts");
  const panel = source("src/components/launch-studio/LaunchSitePublicationPanel.tsx");

  it("uses an authorized draft read for Site Admins, not a publication grant", () => {
    expect(prepare).toContain('requirePartnerWebsiteEditor(actor, db, "site.website.draft.read")');
    expect(prepare).not.toContain('requirePartnerWebsiteEditor(actor, db, "site.website.local.publish")\n      :');
    expect(prepare).toContain('if (site.id !== data.siteId)');
    expect(localEditor).toContain("if(networkGoverned && capability===siteWebsiteLocalPublishCapability)");
  });

  it("exposes publisher controls only after the independent publisher assignment", () => {
    expect(prepare).toContain("await requireSitePublisher(actor, data.siteId);");
    expect(prepare).toContain("if (!(error instanceof AuthorizationError)) throw error;");
    expect(prepare).toContain("canPublishSite,");
    expect(prepare).not.toContain('canPublishSite: actor.role !== "site_website_editor"');
    expect(publisher).toContain("explicit site publication manager assignment");
    expect(panel).toContain("{state.canPublishSite ?");
  });

  it("does not confuse website copy approval with full Site publication", () => {
    expect(prepare).toContain('canReviewWebsiteCopy: isLocalEditor && "canPublish" in site');
    expect(prepare).toContain('requirePartnerWebsiteEditor(actor, db, "site.website.local.publish")');
    expect(panel).toContain("reviewLaunchSiteWebsiteCopy");
    expect(panel).toContain("setSitePublicationStatus");
    expect(panel).toContain("This is the official public Site decision.");
  });
});
