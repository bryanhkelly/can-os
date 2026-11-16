import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { resolveSiteContentBlocks, defaultSiteContentChannelConfig } from "@/domain/site-content-channels";
import { siteTemplateIds } from "@/domain/site-theme";
import { siteFirstPreviewHeaders } from "@/domain/site-first-preview";

const base = (templateId: typeof siteTemplateIds[number]) => ({
  host: "example.can-os.com",
  site: {name: "Example Learning Center", organizationName: "Community Organization"},
  offerings: [],
  localContent: {...emptySiteLocalContent, heroHeadline: "A place to learn.",
    localDescription: "Learning plans are taking shape.",
    branding: {...emptySiteLocalContent.branding, templateId}},
});

describe("Private Site preview pulls data channels through the actual template", () => {
  const channels = resolveSiteContentBlocks(defaultSiteContentChannelConfig, {
    mode: "private", preferences: {
      delivery: "both", interestIds: ["afterschool", "adult", "grades-6-8"],
    },
  });

  it("composes proposed program cards on all seven templates, never as an injected overlay", () => {
    for (const templateId of siteTemplateIds) {
      const site = base(templateId);
      const html = renderPublicSiteHtml({...site, contentBlocks: channels}, {localPreview: true});
      expect(html).toContain('data-content-channel="learning.interests"');
      expect(html).toContain("Afterschool");
      expect(html).toContain("Adult Learning");
      expect(html).toContain("Grades 6–8");
      expect(html).toContain("Proposed · not enrolling");
      expect(html).not.toContain("can-launch-section");
      expect(html).not.toContain("can-launch-interest");
      expect(html).not.toContain("<form");
      expect(renderPublicSiteHtml(site, {localPreview: true}))
        .not.toContain('data-content-channel="learning.interests"');
    }
  });

  it("keeps a dark modern theme for programs instead of a mismatched white insert", () => {
    const html = renderPublicSiteHtml({...base("modern"), contentBlocks: channels}, {localPreview: true});
    expect(html).toContain("body.template-modern .site-content-block .site-channel-card");
    expect(html).toContain("background:#142b44");
    expect(html).toContain("var(--site-display)");
  });

  it("cannot publish private proposed channel content", () => {
    const published = resolveSiteContentBlocks(defaultSiteContentChannelConfig, {
      mode: "public", preferences: {delivery: "both", interestIds: ["adult"]},
    });
    const html = renderPublicSiteHtml({...base("modern"), contentBlocks: published});
    expect(html).not.toContain("Programs you are exploring");
    expect(html).not.toContain("Proposed · not enrolling");
  });

  it("retains the restricted private preview response policy", () => {
    expect(siteFirstPreviewHeaders["Cache-Control"]).toBe("private, no-store");
    expect(siteFirstPreviewHeaders["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(siteFirstPreviewHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("form-action 'none'");
  });
});
