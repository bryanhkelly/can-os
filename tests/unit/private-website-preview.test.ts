import { describe, expect, it } from "vitest";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import {
  parsePrivateWebsitePreviewRequest, privateWebsitePreviewUrl,
  renderPrivateWebsitePreviewHtml, privateWebsitePreviewHeaders,
  privateWebsitePreviewErrorPage,
} from "@/domain/private-website-preview";

const siteId = "f1000000-0000-4000-8000-000000000003";
const base = "https://can-os.bryanhkelly.workers.dev";

describe("authenticated school full-page preview", () => {
  it("accepts a single explicit Site ID and only canonical school pages", () => {
    expect(parsePrivateWebsitePreviewRequest(base + privateWebsitePreviewUrl(siteId)))
      .toEqual({ siteId, page:"/" });
    expect(parsePrivateWebsitePreviewRequest(base + privateWebsitePreviewUrl(siteId,"/about")))
      .toEqual({ siteId, page:"/about" });
    for (const query of [
      "?siteId=" + siteId + "&siteId=" + siteId,
      "?siteId=" + siteId + "&page=/admin",
      "?siteId=" + siteId + "&page=/about&page=/contact",
      "?siteId=" + siteId + "&unexpected=yes",
      "?siteId=not-a-uuid",
      "?page=/",
    ]) expect(parsePrivateWebsitePreviewRequest(base+"/website-preview"+query)).toBeNull();
  });

  it("renders only canonical Site HTML with read-only forms and working private links", () => {
    const page = {
      host: "valorschool.can-os.com",
      site: { name:"Valor School", organizationName:"CAN Synthetic Demonstration School" },
      demonstration:true, offerings:[],
      localContent: {...emptySiteLocalContent,
        localDescription:"A private fictional concept for families.",
        schoolVision:"A community of curiosity."},
    };
    const paths = availablePublicSitePaths(page);
    expect(paths).toContain("/about");
    const html = renderPublicSiteHtml(page,{localPreview:true});
    expect(html).not.toContain("<form");
    const fullPage = renderPrivateWebsitePreviewHtml(html,siteId,paths);
    expect(fullPage).toContain("Private school website preview");
    expect(fullPage).toContain("Saved design · not published · sign-in required");
    expect(fullPage).toContain(privateWebsitePreviewUrl(siteId,"/about").replaceAll("&","&amp;").split("&amp;")[0]);
    expect(fullPage).toContain(`href="${privateWebsitePreviewUrl(siteId,"/about")}"`);
    expect(fullPage).toContain('href="#main-content"');
    expect(fullPage).toContain("Return to Website &amp; Brand Studio");
    expect(fullPage).not.toContain("<form");
    expect(fullPage).not.toContain("<script");
    expect(fullPage).not.toContain('href="/about"');
  });

  it("does not authorize missing or unconfigured pages", () => {
    const html = '<!doctype html><html><head><title>School</title></head><body><a href="/contact">Contact</a><a href="/about">About</a><a href="#main-content">Skip</a></body></html>';
    const preview = renderPrivateWebsitePreviewHtml(html,siteId,["/","/about"]);
    expect(preview).toContain('href="/contact"');
    expect(preview).toContain(`href="${privateWebsitePreviewUrl(siteId,"/about")}"`);
    expect(preview).toContain('href="#main-content"');
    expect(privateWebsitePreviewHeaders["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(privateWebsitePreviewHeaders["Cache-Control"]).toBe("private, no-store");
    expect(privateWebsitePreviewHeaders["Content-Security-Policy"]).toContain("form-action 'none'");
  });

  it("escapes error pages and never reflects untrusted HTML into the response", () => {
    const html = privateWebsitePreviewErrorPage("<private>", "<script>bad</script>");
    expect(html).toContain("&lt;private&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
