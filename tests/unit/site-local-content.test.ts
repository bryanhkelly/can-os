import { describe, expect, it } from "vitest";
import {
  classifySiteLocalContent, emptySiteLocalContent, normalizeSiteLocalContent,
} from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

const churchCopy = {
  ...emptySiteLocalContent,
  welcomeMessage: "We welcome local families!",
  localDescription: "Fellowship Church is excited to create learning opportunities.",
  denomination: "Pentecostal · Church of God in Christ",
  statementOfFaith: "We believe in prayer, worship, and spiritual gifts.",
  spiritualFormation: "Our local chapel includes prayer and Bible study.",
};

describe("PUB-18: distributed church website ownership", () => {
  it("publishes normal local, denominational and theological content without CAN review", () => {
    expect(classifySiteLocalContent(normalizeSiteLocalContent(churchCopy)))
      .toEqual({ status: "published", flaggedFields: [] });
    expect(classifySiteLocalContent({
      ...churchCopy,
      denomination: "Nondenominational",
      statementOfFaith: "We observe the Eucharist and affirm our historic creed.",
    }).status).toBe("published");
  });

  it("holds academic and protected third-party endorsement claims", () => {
    for (const claim of [
      "Our school is fully accredited.",
      "We issue an official diploma.",
      "Tuition is $100 a month.",
      "Enrollment is open now.",
      "We are officially endorsed by the denomination.",
    ]) {
      const decision = classifySiteLocalContent({
        ...churchCopy, localDescription: claim,
      });
      expect(decision.status).toBe("review_required");
      if (decision.status === "review_required")
        expect(decision.flaggedFields).toContain("localDescription");
    }
  });

  it("rejects active HTML, scripts and exposed sensitive student information", () => {
    for (const value of [
      "<script>alert('hi')</script>",
      "<iframe src='https://host.test'></iframe>",
      "javascript:alert(1)",
      "Here are student medical records",
    ]) expect(() => classifySiteLocalContent({
      ...churchCopy, statementOfFaith: value,
    })).toThrow(/cannot be published/);
  });

  it("normalizes newlines, caps length and rejects control characters", () => {
    const normalized = normalizeSiteLocalContent({
      ...churchCopy, welcomeMessage: "  Welcome\r\n friends  ",
    });
    expect(normalized.welcomeMessage).toBe("Welcome\n friends");
    expect(() => normalizeSiteLocalContent({
      ...churchCopy, welcomeMessage: "x".repeat(241),
    })).toThrow(/exceeds/);
    expect(() => normalizeSiteLocalContent({
      ...churchCopy, denomination: "denomination\u0000name",
    })).toThrow();
  });

  it("renders church copy as escaped, explicitly locally owned content next to CAN listings", () => {
    const html = renderPublicSiteHtml({
      host: "fellowship.can-os.com",
      site: { name: "Fellowship Academy", organizationName: "Fellowship Church" },
      offerings: [],
      localContent: {
        ...churchCopy,
        statementOfFaith: "We believe & worship with <b>faith</b>.",
      },
    });
    expect(html).toContain("Content provided by the local church");
    expect(html).toContain("Denominational identity");
    expect(html).toContain("Church of God in Christ");
    expect(html).toContain("Spiritual formation");
    expect(html).toContain("&amp; worship with &lt;b&gt;faith&lt;/b&gt;.");
    expect(html).not.toContain("<b>faith</b>");
    expect(html).not.toContain("<form");
  });
});
