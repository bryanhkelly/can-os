import { describe, expect, it } from "vitest";
import { renderPublicSiteClaimsHtml } from "@/domain/public-site-html";

describe("canonical public Site claims HTML", () => {
  it("escapes published content and omits internal identifiers", () => {
    const html = renderPublicSiteClaimsHtml({
      siteName: "North <School>",
      claims: [{
        operationId: "00000000-0000-4000-8000-000000000011",
        kind: "operating",
        displayText: "A&B <Academy>",
        publishedAt: new Date("2026-11-12T12:00:00.000Z"),
      }],
    });

    expect(html).toContain("North &lt;School&gt;");
    expect(html).toContain("A&amp;B &lt;Academy&gt;");
    expect(html).toContain("Public status: operating.");
    expect(html).not.toContain("00000000-0000-4000-8000-000000000011");
  });
});
