import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { publicSiteStyles } from "@/domain/public-site-styles";
import { siteTemplateIds } from "@/domain/site-theme";
import { emptySiteLocalContent } from "@/domain/site-local-content";

describe("shared public Site stylesheet", () => {
  it("does not emit literal slash-n in generated CSS instead of a newline", () => {
    // Regression for the prior /n vs \\n typo. Check rendered stylesheet text,
    // not only TypeScript parsing, since both strings are syntactically valid.
    expect(publicSiteStyles).toContain("\\n");
    expect(publicSiteStyles).not.toContain("/n");
  });

  it("uses the same static reviewed stylesheet in each of the seven templates", () => {
    for (const templateId of siteTemplateIds) {
      const html = renderPublicSiteHtml({
        host: "sample.example.org",
        site: { name: "Example Site", organizationName: "Community Host" },
        offerings: [],
        localContent: {
          ...emptySiteLocalContent,
          branding: { ...emptySiteLocalContent.branding, templateId },
        },
      }, { localPreview: true });
      const stylesheet = html.match(/<style>\n([\s\S]*?)\n<\/style>/)?.[1];
      expect(stylesheet, templateId).toBe(publicSiteStyles);
      expect(stylesheet).toContain(".site-content-block");
      expect(stylesheet).toContain(".launch-status-banner");
      expect(html).not.toContain("<script");
    }
  });
});
