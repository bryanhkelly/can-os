import { describe, expect, it } from "vitest";
import { escapePublicHtml, isIndexablePublicSite, renderPublicSiteHtml, availablePublicSitePaths } from "@/domain/public-site-html";
import { projectApprovedParentInformation, unconfiguredClaim, verifiedPublicClaim } from "@/domain/parent-information";

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
    expect(html).toContain('href="/" aria-current="page"');
    expect(html).not.toContain('href="/guardian');
    expect(html).not.toContain("guardian/enrichment");
    expect(html).not.toContain("studentProfileId");
  });
  it("offers real public pages only for approved content and keeps draft pages unindexed", () => {
    const page = {
      host: "vineyard.can-os.com",
      site: { name: "Vineyard Academy", organizationName: "Vineyard Church" },
      offerings: [],
      localContent: {
        welcomeMessage: "", localDescription: "", denomination: "",
        statementOfFaith: "", spiritualFormation: "",
        churchHistory: "Community rooted in service.",
        schoolVision: "A welcoming place for families.",
        branding: { theme: "classic" as const, heroImage: null },
      },
      academicPrograms: [{
        programId: "program-one", title: "Proposed school program",
        typeLabel: "Hybrid academy", summary: "Program information.",
        grades: { min: "K", max: "5" },
        delivery: { onsite: true, liveOnline: false, asynchronous: true,
          onsiteDaysPerWeek: 2 },
        availability: "planned" as const,
      }],
    };
    const about = renderPublicSiteHtml(page, { path: "/about" });
    expect(about).toContain("Community rooted in service.");
    expect(about).toContain('content="noindex,nofollow"');
    expect(about).not.toContain("<form");
    expect(about).not.toContain("Proposed school program");
    const schoolDay = renderPublicSiteHtml(page, {path: "/school-day"});
    expect(schoolDay).toContain("2 onsite days per week");
    expect(schoolDay).toContain("does not imply a Monday–Friday schedule");
    const live = renderPublicSiteHtml(page, {
      path: "/academics", makeRequestId: () => "request-a",
    });
    expect(live).toContain('rel="canonical" href="https://vineyard.can-os.com/academics"');
    expect(live).toContain('action="/inquiry"');
    expect(() => renderPublicSiteHtml({ ...page, academicPrograms: [] },
      { path: "/academics" })).toThrow(/not available/);
  });
  it("does not advertise an unconfigured contact page and clarifies pre-opening interest", () => {
    const empty = {host: "church.can-os.com", site: {name: "Church School", organizationName: "Church"}, offerings: []};
    expect(availablePublicSitePaths(empty)).toEqual(["/"]);
    const planned = {...empty, academicPrograms: [{
      programId: "00000000-0000-4000-8000-000000000002",
      title: "Elementary program", typeLabel: "Hybrid program", summary: "Proposed program",
      grades: {min: "K", max: "5"},
      delivery: {onsite: true, asynchronous: true, liveOnline: false, onsiteDaysPerWeek: 2},
      availability: "planned" as const,
    }]};
    const html = renderPublicSiteHtml(planned, {makeRequestId: () => "00000000-0000-4000-8000-000000000001"});
    expect(html).toContain("Welcoming founding families");
    expect(html).toContain("A request for information is not an application or an enrollment offer");
    expect(html).toContain('action="/inquiry"');
    expect(html).not.toContain('action="/apply"');
    expect(html).toContain("<title>Church School | Programs</title>");
  });

  it("distinguishes multiple academic Programs by grade without inventing universal weekdays", () => {
    const page = {
      host: "academy.can-os.com", site: {name: "Academy", organizationName: "Church"},
      offerings: [],
      academicPrograms: [
        {programId: "program-elementary", title: "Elementary Academy", typeLabel: "School",
          summary: "Elementary", grades: {min: "K", max: "5"},
          delivery: {onsite: true, asynchronous: false, liveOnline: false, onsiteDaysPerWeek: 3},
          availability: "planned" as const},
        {programId: "program-high-school", title: "High School Hybrid", typeLabel: "Hybrid",
          summary: "High school", grades: {min: "9", max: "12"},
          delivery: {onsite: true, asynchronous: true, liveOnline: true, onsiteDaysPerWeek: 2},
          availability: "planned" as const},
      ],
    };
    const html = renderPublicSiteHtml(page, {path: "/school-day"});
    expect(html).toContain("Select a program's school day");
    expect(html).toContain('href="#school-day-program-elementary"');
    expect(html).toContain('id="school-day-program-high-school"');
    expect(html).toContain("Grades K–5");
    expect(html).toContain("Grades 9–12");
    expect(html).toContain("3 onsite days per week");
    expect(html).toContain("2 onsite days per week");
    expect(html).not.toContain("Monday, Tuesday, Wednesday, Thursday, Friday");
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
    const localPreview = renderPublicSiteHtml({
      ...page,
      academicPrograms: page.academicPrograms.map(program => ({
        ...program, applicationOpen: true,
      })),
    }, { ...opts, localPreview: true });
    expect(localPreview).toContain("Hybrid Academy");
    expect(localPreview).toContain("Local read-only preview");
    expect(localPreview).toContain("Applications available on the live website only");
    expect(localPreview).not.toContain("<form");
    expect(localPreview).not.toContain('action="/apply"');
    expect(localPreview).not.toContain('action="/inquiry"');
    expect(localPreview).not.toContain("use the request-information form");
  });


  it("shows only approved Sunday-inclusive school hours and reviewed family services", () => {
    const academicProgram = {
      programId: "00000000-0000-4000-8000-000000000002",
      title: "Community Academy", typeLabel: "Hybrid academy",
      summary: "Reviewed academic program.", grades: {min: "K", max: "5"},
      delivery: {onsite: true, liveOnline: false, asynchronous: true, onsiteDaysPerWeek: 2},
      availability: "planned" as const,
    };
    const site = {name: "Community Academy", organizationName: "Community Church"};
    const page = {
      host: "community.can-os.com", site, academicPrograms: [academicProgram],
      offerings: [],
      parentInformation: projectApprovedParentInformation({
        site, academicPrograms: [academicProgram], offerings: [], localContent: null,
        schoolDay: {
          days: verifiedPublicClaim([0, 3], "calendar", 6),
          startTime: verifiedPublicClaim("09:00", "calendar", 6),
          endTime: verifiedPublicClaim("14:00", "calendar", 6),
          mode: unconfiguredClaim<"onsite" | "online" | "hybrid">("institutional_record"),
        },
        services: [
          {category: "meals", description: verifiedPublicClaim(
            "Lunch available for enrolled students.", "institutional_record", 2)},
          {category: "transportation", description: unconfiguredClaim("institutional_record")},
        ],
      }),
    };
    const schoolDayHtml = renderPublicSiteHtml(page, {path: "/school-day"});
    expect(schoolDayHtml).toContain("Institutionally reviewed schedule");
    expect(schoolDayHtml).toContain("Sunday, Wednesday");
    expect(schoolDayHtml).toContain("09:00–14:00 (school-local time)");
    expect(schoolDayHtml).toContain("not confirmation that the school is");
    const familiesHtml = renderPublicSiteHtml(page, {path: "/families"});
    expect(familiesHtml).toContain("Lunch available for enrolled students.");
    expect(familiesHtml).not.toContain("<h3>transportation</h3>");
    expect(familiesHtml).not.toContain("reviewedByPersonId");
    const withheld = projectApprovedParentInformation({
      site, academicPrograms: [academicProgram], offerings: [], localContent: null,
    });
    const unpublished = renderPublicSiteHtml({
      ...page, parentInformation: withheld,
    }, {path: "/school-day"});
    expect(unpublished).not.toContain("Sunday, Wednesday");
    expect(unpublished).toContain("reviewed public timetable is not available");
  });



  it("connects parent discovery to approved pages without inventing admissions or legal status", () => {
    const site = { name: "Sample Academy", organizationName: "Sample Church" };
    const academicPrograms = [{
      programId: "00000000-0000-4000-8000-000000000002",
      title: "Community Learning", typeLabel: "Hybrid academy",
      summary: "An approved program description.",
      grades: { min: "K", max: "5" },
      delivery: { onsite: true, liveOnline: false, asynchronous: true, onsiteDaysPerWeek: 2 },
      availability: "planned" as const,
    }];
    const profile = projectApprovedParentInformation({
      site, academicPrograms, offerings: [], localContent: null,
    });
    const page = {
      host: "sample.can-os.com", site, offerings: [], academicPrograms,
      parentInformation: profile,
    };
    const home = renderPublicSiteHtml(page);
    expect(home).toContain("Find what matters to your family");
    expect(home).toContain('href="/school-day"');
    expect(home).toContain('href="/admissions"');
    expect(home).not.toContain('href="/student-life"');
    const admissions = renderPublicSiteHtml(page, { path: "/admissions" });
    expect(admissions).toContain("Applications are not currently open");
    expect(admissions).not.toContain("School status and disclosures");
    expect(admissions).not.toContain('action="/apply"');

    profile.admissions.description = verifiedPublicClaim(
      "Admission decisions require <verified> school review.", "admissions", 2);
    profile.disclosures = [{
      category: "jurisdiction",
      statement: verifiedPublicClaim("Official <state> information.", "jurisdiction_profile", 3),
    }, {
      category: "accreditation",
      statement: unconfiguredClaim("jurisdiction_profile"),
    }];
    const reviewed = renderPublicSiteHtml(page, { path: "/admissions" });
    expect(reviewed).toContain("Admission decisions require &lt;verified&gt; school review.");
    expect(reviewed).toContain("Official &lt;state&gt; information.");
    expect(reviewed).not.toContain("<h3>Accreditation</h3>");
    expect(reviewed).not.toContain('action="/apply"');
    expect(reviewed).toContain("Applications are not currently open through this website");
  });

  it("marks synthetic schools explicitly without affecting real school pages", () => {
    const site = { name: "Fictional Learning Academy", organizationName: "Sample Community" };
    const page = { host: "example.can-os.com", site, offerings: [] };
    const ordinary = renderPublicSiteHtml(page);
    const demonstration = renderPublicSiteHtml({ ...page, demonstration: true });
    expect(ordinary).not.toContain('class="demo-banner"');
    expect(demonstration).toContain('class="demo-banner"');
    expect(demonstration).toContain("Fictional Learning Academy is a fictional demonstration school.");
    expect(demonstration).not.toContain("Valor is a fictional");
    const hostedDemo = renderPublicSiteHtml({...page, demonstration: true}, {
      makeRequestId: () => "00000000-0000-4000-8000-000000000001",
    });
    expect(hostedDemo).toContain('content="noindex,nofollow"');
    expect(isIndexablePublicSite({...page, demonstration: true})).toBe(false);
    expect(isIndexablePublicSite(page)).toBe(true);
    const hostedOrdinary = renderPublicSiteHtml(page, {
      makeRequestId: () => "00000000-0000-4000-8000-000000000001",
    });
    expect(hostedOrdinary).toContain('content="index,follow"');
  });

  it("shows mission storytelling only when local school vision exists", () => {
    const site = { name: "Heritage Academy", organizationName: "Heritage Community" };
    const page = {host: "heritage.can-os.com", site, offerings: []};
    const ordinary = renderPublicSiteHtml(page);
    expect(ordinary).not.toContain("Learning with purpose. Growing together.");
    const story = renderPublicSiteHtml({...page, localContent: {
      welcomeMessage: "Come learn with us.", localDescription: "",
      denomination: "", statementOfFaith: "", spiritualFormation: "",
      schoolVision: "Growth, curiosity & community.",
      branding: {theme: "classic" as const, heroImage: null},
    }});
    expect(story).toContain("Learning with purpose. Growing together.");
    expect(story).toContain("Growth, curiosity &amp; community.");
    expect(story).not.toContain("<script");
  });

  it("only renders independently reviewed Site address and contact details", () => {
    const site = { name: "Example Academy", organizationName: "Example Partner" };
    const parentInformation = projectApprovedParentInformation({
      site, academicPrograms: [], offerings: [], localContent: null,
    });
    const page = { host: "example.can-os.com", site, offerings: [], parentInformation };
    expect(() => renderPublicSiteHtml(page, { path: "/contact" }))
      .toThrow(/not available/);

    parentInformation.site.contact = verifiedPublicClaim(
      "Office: family@example.org <please call>", "institutional_record", 4);
    parentInformation.site.address = verifiedPublicClaim(
      "123 School Road\\nSample City", "organization_site", 4);
    const approved = renderPublicSiteHtml(page, { path: "/contact" });
    expect(approved).toContain("Office: family@example.org &lt;please call&gt;");
    expect(approved).toContain("123 School Road");
    expect(approved).toContain("not confirmation that the site is open for visits");
    expect(approved).not.toContain("No public inquiry channel is currently available");

    parentInformation.site.contact = unconfiguredClaim("institutional_record");
    const addressOnly = renderPublicSiteHtml(page, { path: "/contact" });
    expect(addressOnly).not.toContain("Published contact information");
  });
});
