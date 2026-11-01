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

  it("renders script-free same-origin inquiry forms only for approved academic items", () => {
    const program = {
      programId: "00000000-0000-4000-8000-000000000002",
      title: "Academy", typeLabel: "Hybrid program",
      summary: "An approved academic marketing description.",
      grades: { min: "9", max: "12" },
      delivery: { onsite: true, asynchronous: true,
        liveOnline: false, onsiteDaysPerWeek: 2 },
      availability: "planned" as const,
    };
    const html = renderPublicSiteHtml({
      host: "school.can-os.com",
      site: { name: "School", organizationName: "Organization" },
      academicPrograms: [program],
      offerings: [],
    }, { makeRequestId: () => "00000000-0000-4000-8000-000000000001" });
    expect(html).toContain('action="/inquiry" method="post"');
    expect(html).toContain('name="contactConsent" value="yes" required');
    expect(html).toContain('name="programId"');
    expect(html).toContain('name="website"');
    expect(html).toContain("not an application or enrollment request");
    expect(html).not.toContain("<script");
  });

  it("uses one website template for the authenticated read-only preview and public host", () => {
    const page = {
      host: "fellowship-academy.can-os.com",
      site: { name: "Fellowship Academy", organizationName: "Fellowship Church" },
      offerings: [],
      academicPrograms: [{
        programId: "00000000-0000-4000-8000-000000000002",
        title: "Hybrid Grade 9",
        typeLabel: "High school extension",
        summary: "Approved school program information.",
        grades: { min: "9", max: "9" },
        delivery: {
          onsite: true, liveOnline: false, asynchronous: true,
          onsiteDaysPerWeek: 2,
        },
        availability: "planned" as const,
      }],
    };
    const draft = renderPublicSiteHtml(page);
    const hosted = renderPublicSiteHtml(page, {
      makeRequestId: () => "00000000-0000-4000-8000-000000000001",
    });
    for (const shared of [
      "<!doctype html>", "<title>Fellowship Academy | Programs</title>",
      "Fellowship Church", "Hybrid Grade 9", "Approved school program information.",
      "Program planned", "fellowship-academy.can-os.com",
    ]) {
      expect(draft).toContain(shared);
      expect(hosted).toContain(shared);
    }
    expect(draft).not.toContain("<form");
    expect(draft).not.toContain('name="contactEmail"');
    expect(draft).not.toContain('action="/inquiry"');
    expect(draft).not.toContain("<script");
    expect(hosted).toContain('action="/inquiry"');
  });

  it("does not invite applicants just because an academic Program is active", () => {
    const page = {
      host: "academy.can-os.com",
      site: { name: "Academy", organizationName: "Church partner" },
      offerings: [],
      academicPrograms: [{
        programId: "00000000-0000-4000-8000-000000000002",
        title: "Hybrid Academy",
        summary: "A program with independent operational readiness.",
        typeLabel: "Hybrid learning program",
        grades: { min: "9", max: "12" },
        delivery: { onsite: true, liveOnline: true, asynchronous: true,
          onsiteDaysPerWeek: 2 },
        availability: "operating" as const,
      }],
    };
    const opts = { makeRequestId: () => "00000000-0000-4000-8000-000000000001" };
    const withoutInstitutionalApproval = renderPublicSiteHtml(page, opts);
    expect(withoutInstitutionalApproval).toContain("Current program");
    expect(withoutInstitutionalApproval).toContain("applications not currently available");
    expect(withoutInstitutionalApproval).toContain('action="/inquiry"');
    expect(withoutInstitutionalApproval).not.toContain('action="/apply"');
    const authorized = renderPublicSiteHtml({
      ...page,
      academicPrograms: page.academicPrograms.map(program => ({
        ...program, applicationOpen: true,
      })),
    }, opts);
    expect(authorized).toContain('action="/apply" method="post"');
    expect(authorized).toContain("Verify email to apply");
  });

});
