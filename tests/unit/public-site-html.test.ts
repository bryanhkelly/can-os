import { describe, expect, it } from "vitest";
import { escapePublicHtml, renderPublicSiteHtml } from "@/domain/public-site-html";

describe("standalone public site HTML", () => {
  it("escapes all publisher-controlled text and contains no client script or private links", () => {
    expect(escapePublicHtml(`"&<>'`)).toBe("&quot;&amp;&lt;&gt;&#39;");
    const html = renderPublicSiteHtml({
      host: "vineyard.can-os.com",
      site: { name: '<script>alert("site")</script>', organizationName: "Church & School" },
      offerings: [{
        seasonId: "offering-a",
        title: '<img src=x onerror="evil()">', season: "July '27",
        programName: "Art & STEM", startsOn: "2027-07-01",
        endsOn: "2027-07-31", feeAmountCents: 5000, seatsRemaining: 4,
        registrationOpen: true, firstMeeting: null, meetingTimezone: null,
        packages: [{
          id: "package-1", title: "Week 1", priceCents: 1500,
          available: true, seatsRemaining: 2,
        }],
      }],
    });
    expect(html).toContain("&lt;script&gt;alert(&quot;site&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt;");
    expect(html).toContain("Church &amp; School");
    expect(html).toContain("Starting at $15.00");
    expect(html).toContain("4 seats remaining");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="/');
    expect(html).not.toContain("guardian/enrichment");
    expect(html).not.toContain("studentProfileId");
  });
  it("renders an empty published catalog without claiming enrollment is available", () => {
    const html = renderPublicSiteHtml({
      host: "partner.can-os.com",
      site: { name: "Partner", organizationName: "Church" },
      offerings: [],
    });
    expect(html).toContain("There are no programs to display");
    expect(html).not.toContain("Register now");
  });
  it("renders approved academic marketing without implying enrollment or trusting description HTML", () => {
    const html = renderPublicSiteHtml({
      host: "academy.can-os.com",
      site: { name: "Partner Academy", organizationName: "Partner Church" },
      offerings: [],
      academicPrograms: [{
        programId: "p", title: "Ninth Grade Hybrid Academy",
        typeLabel: "High school extension",
        summary: "Students learn <script> with mentorship & coaching.",
        grades: { min: "9", max: "9" },
        delivery: { onsite: true, liveOnline: true,
          asynchronous: true, onsiteDaysPerWeek: 2 },
        availability: "planned",
      }],
    });
    expect(html).toContain("Ninth Grade Hybrid Academy");
    expect(html).toContain("Grades 9–9");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; coaching");
    expect(html).toContain("2 onsite days per week");
    expect(html).toContain("Program planned");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Apply now");
  });

});
