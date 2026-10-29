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

  function pngDataUrl(withMetadata = false): string {
    const chunk = (type: string, data: Buffer) => Buffer.concat([
      Buffer.from(new Uint32Array([data.length]).buffer).swap32(),
      Buffer.from(type, "ascii"), data, Buffer.alloc(4),
    ]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
    header.set([8, 6, 0, 0, 0], 8);
    const chunks = [chunk("IHDR", header), chunk("IDAT", Buffer.from([0]))];
    if (withMetadata) chunks.push(chunk("tEXt", Buffer.from("location\\0private")));
    chunks.push(chunk("IEND", Buffer.alloc(0)));
    return "data:image/png;base64," + Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks,
    ]).toString("base64");
  }

  it("publishes approved local artwork only with rights and child-consent evidence", () => {
    const content = normalizeSiteLocalContent({
      ...churchCopy,
      branding: { theme: "warm", heroImage: {
        dataUrl: pngDataUrl(), altText: "Church & community artwork",
        rightsConfirmed: true, childImageConsent: "no_identifiable_children",
      } },
    });
    const html = renderPublicSiteHtml({
      host: "fellowship.can-os.com",
      site: { name: "Fellowship Academy", organizationName: "Fellowship Church" },
      offerings: [], localContent: content,
    });
    expect(content.branding.theme).toBe("warm");
    expect(html).toContain('<body class="theme-warm">');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain('alt="Church &amp; community artwork"');
    expect(html).not.toContain("src=\"https:");
  });

  it("rejects missing image rights, unconfirmed child consent and remote images", () => {
    for (const image of [
      { dataUrl: pngDataUrl(), altText: "Artwork", rightsConfirmed: false,
        childImageConsent: "no_identifiable_children" as const },
      { dataUrl: pngDataUrl(), altText: "Artwork", rightsConfirmed: true,
        childImageConsent: "unconfirmed" as const },
      { dataUrl: "https://tracker.test/child.jpg", altText: "Artwork", rightsConfirmed: true,
        childImageConsent: "guardian_consent_confirmed" as const },
      { dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", altText: "Artwork", rightsConfirmed: true,
        childImageConsent: "no_identifiable_children" as const },
    ]) expect(() => normalizeSiteLocalContent({
      ...churchCopy, branding: { theme: "classic", heroImage: image },
    })).toThrow();
  });

  it("rejects PNG metadata and defaults legacy text-only revisions safely", () => {
    expect(() => normalizeSiteLocalContent({
      ...churchCopy, branding: { theme: "classic", heroImage: {
        dataUrl: pngDataUrl(true), altText: "Artwork", rightsConfirmed: true,
        childImageConsent: "guardian_consent_confirmed",
      } },
    })).toThrow(/metadata/);
    const { branding: _branding, ...legacy } = churchCopy;
    expect(normalizeSiteLocalContent(legacy).branding).toEqual({ theme: "classic", heroImage: null });
  });

  it("cannot persist CAN-owned academic fields through the local content payload", () => {
    const candidate = { ...churchCopy, accreditation: "CAN accredited", tuition: 100 };
    const normalized = normalizeSiteLocalContent(candidate);
    expect(normalized).not.toHaveProperty("accreditation");
    expect(normalized).not.toHaveProperty("tuition");
    expect(normalized).not.toHaveProperty("academicProviderOrganizationId");
  });
});
