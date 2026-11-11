import { describe, expect, it } from "vitest";
import { escapePublicHtml, isIndexablePublicSite, renderPublicSiteHtml, availablePublicSitePaths, withIllustrativeLocalPreview } from "@/domain/public-site-html";
import { projectApprovedParentInformation, unconfiguredClaim, verifiedPublicClaim } from "@/domain/parent-information";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { siteTemplateIds } from "@/domain/site-theme";

describe("standalone public site HTML", () => {
  it("labels unauthorised/pre-opening public pages on all seven templates without altering private previews",()=>{
    for(const templateId of siteTemplateIds) {
      const page={
        host:"example-school.can-os.com",
        site:{name:"Example School",organizationName:"Host Organization"},
        offerings:[],
        operatingStatus:"development" as const,
        localContent:{...emptySiteLocalContent,
          branding:{...emptySiteLocalContent.branding,templateId}},
      };
      const publicHtml=renderPublicSiteHtml(page);
      expect(publicHtml).toContain("School in development · Not yet open for enrollment.");
      expect(publicHtml).toContain(`template-${templateId}`);
      expect(publicHtml).not.toContain("<script");
      const privateHtml=renderPublicSiteHtml(page,{localPreview:true});
      expect(privateHtml).not.toContain("School in development · Not yet open for enrollment.");
      const authorized=renderPublicSiteHtml({...page,operatingStatus:"authorized" as const});
      expect(authorized).not.toContain("launch-status-banner\" role");
    }
  });

  it("uses clearly labeled sample photography only in private previews without approved Site photos", () => {
    for(const templateId of siteTemplateIds) {
      const page={
        host:"example-school.can-os.com",
        site:{name:"Example School",organizationName:"Example Organization"},
        offerings:[],
        localContent:{...emptySiteLocalContent,
          branding:{...emptySiteLocalContent.branding,templateId}},
      };
      const privateHtml=renderPublicSiteHtml(page,{localPreview:true});
      expect(privateHtml).toContain("/template-photo/");
      expect(privateHtml).toContain("Template photography");
      const publicHtml=renderPublicSiteHtml(page);
      expect(publicHtml).not.toContain("/template-photo/");
      expect(publicHtml).not.toContain("Template photography");
    }
  });

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
    expect(html).not.toContain('href="/home');
    expect(html).not.toContain("guardian/enrichment");
    expect(html).not.toContain("studentProfileId");
  });
  it("makes synthetic local previews fully navigable without real inquiry or enrollment submission", () => {
    const original={host:"valorschool.can-os.com",site:{name:"Valor School",organizationName:"Synthetic school"},
      demonstration:true,offerings:[],academicPrograms:[{programId:"school-a",title:"Hybrid High School",
      typeLabel:"High school",summary:"A fictional example",grades:{min:"9",max:"12"},
      delivery:{onsite:true,liveOnline:true,asynchronous:true,onsiteDaysPerWeek:2},
      availability:"planned" as const}]};
    const preview=withIllustrativeLocalPreview(original);
    const paths=availablePublicSitePaths(preview);
    expect(paths).toContain("/about");
    expect(paths).toContain("/student-life");
    expect(paths).toContain("/families");
    for(const path of paths){
      const html=renderPublicSiteHtml(preview,{path,localPreview:true,localPreviewSlug:"valorschool",
        localPreviewSubmissionsEnabled:true,makeRequestId:()=>"11111111-1111-4111-8111-111111111111"});
      expect(html).toContain('href="/published-site?site=valorschool"');
      expect(html).not.toContain('href="/academics"');
      expect(html).not.toContain('action="/apply"');
      expect(html).not.toContain("<form");
      expect(html).toContain("DEMONSTRATION SCHOOL");
      expect(html).toContain('content="noindex,nofollow"');
    }
    const academics=renderPublicSiteHtml(preview,{path:"/academics",localPreview:true,
      localPreviewSlug:"valorschool",localPreviewSubmissionsEnabled:true,
      makeRequestId:()=>"11111111-1111-4111-8111-111111111111"});
    expect(academics).toContain("Hybrid High School");
    expect(academics).not.toContain('id="program-inquiry-school-a"');
    expect(academics).not.toContain("Applications available · identity verification required");
    expect(renderPublicSiteHtml(preview,{path:"/student-life",localPreview:true,
      localPreviewSlug:"valorschool"})).toContain("Robotics &amp; Design Lab");
    const readOnly=renderPublicSiteHtml(preview,{path:"/academics",localPreview:true,
      localPreviewSlug:"valorschool",makeRequestId:()=>"11111111-1111-4111-8111-111111111111"});
    expect(readOnly).not.toContain("<form");
    expect(availablePublicSitePaths(original)).not.toContain("/about");
  });

  it("offers a complete, compelling fictional prospectus without fabricated enrollment actions", () => {
    const demo=withIllustrativeLocalPreview({
      host:"showcase.can-os.com",
      site:{name:"Showcase Academy",organizationName:"Community Partner"},
      demonstration:true,offerings:[],
    });
    const paths=availablePublicSitePaths(demo);
    expect(paths).toHaveLength(10);
    const checks: Array<[typeof paths[number],string]> = [
      ["/academics","Humanities &amp; Communication"],
      ["/student-life","Robotics &amp; Design Lab"],
      ["/school-day","Time to focus. Space to connect."],
      ["/admissions","Discover the school. Picture your place in it."],
      ["/tuition","An investment you can understand."],
      ["/families","In the loop. In the conversation."],
      ["/faq","The questions that matter most."],
      ["/contact","A good school conversation starts"],
    ];
    for(const [path,copy] of checks) {
      const html=renderPublicSiteHtml(demo,{path,makeRequestId:()=> "123"});
      expect(html).toContain(copy);
      expect(html).toContain("DEMONSTRATION SCHOOL");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Illustrative family experience");
      expect(html).toContain('content="noindex,nofollow"');
    }
    expect(availablePublicSitePaths({...demo,demonstration:false})).not.toContain("/academics");
  });

  it("routes locally previewed application forms through the canonical verification endpoint only when authorized",()=>{
    const page={host:"sample.can-os.com",site:{name:"Sample",organizationName:"Sample Church"},
      offerings:[],academicPrograms:[{programId:"program-id",title:"School Program",
        typeLabel:"School",summary:"Reviewed details",grades:{min:"9",max:"12"},
        delivery:{onsite:true,liveOnline:false,asynchronous:true,onsiteDaysPerWeek:2},
        availability:"operating" as const,applicationOpen:true}]};
    const html=renderPublicSiteHtml(page,{localPreview:true,localPreviewSlug:"sample",
      localPreviewSubmissionsEnabled:true,makeRequestId:()=>"11111111-1111-4111-8111-111111111111"});
    expect(html).toContain('action="/published-site/family-start?site=sample"');
    expect(html).toContain("Verify email to apply");
    expect(html).not.toContain('action="/apply"');
  });

  it("uses the same editorial page composition for two distinct churches, not only Valor", () => {
    const makePage = (school: string, host: string) => ({
      host, site: {name: school, organizationName: school + " Church"}, offerings: [],
      localContent: {
        welcomeMessage: "A thoughtful welcome to " + school,
        localDescription: "Community-defined identity for " + school,
        schoolVision: "Locally approved purpose for " + school,
        churchHistory: "A genuine church history supplied by the editor.",
        branding: {theme: "classic" as const, heroImage: null},
      },
      academicPrograms: [{programId:"program-a",title:"Elementary learning",
        typeLabel:"Elementary school",summary:"Published program facts",
        grades:{min:"K",max:"5"},
        delivery:{onsite:true,liveOnline:false,asynchronous:true,onsiteDaysPerWeek:2},
        availability:"planned" as const}],
    });
    for (const [name,host] of [["Valor School","valor.can-os.com"],
      ["Hillside Learning Academy","hillside.can-os.com"]] as const) {
      const page=makePage(name,host);
      const home=renderPublicSiteHtml(page);
      const about=renderPublicSiteHtml(page,{path:"/about"});
      const academics=renderPublicSiteHtml(page,{path:"/academics"});
      expect(home).toContain('class="home-story editorial-section"');
      expect(home).toContain('class="program-overview editorial-section"');
      expect(home).toContain("Get to know our school");
      expect(home).toContain("Explore all academic programs");
      expect(home).toContain("Community-defined identity for " + name);
      expect(home).not.toContain("A community with a story to tell.");
      expect(about).toContain("A community with a story to tell.");
      expect(about).toContain("A genuine church history supplied by the editor.");
      expect(academics).toContain("Elementary learning");
      expect(academics).not.toContain("A genuine church history supplied by the editor.");
      expect(availablePublicSitePaths(page)).toContain("/about");
    }
  });

  it("never invents replacement artwork when a school has no approved photo",()=>{
    const page={host:"example.can-os.com",site:{name:"School",organizationName:"Church"},offerings:[],
      localContent:{...emptySiteLocalContent,welcomeMessage:"Welcome",localDescription:"Our community",
        churchHistory:"Our story",schoolVision:"Our purpose",
        branding:{theme:"classic" as const,paletteId:"forest" as const,
          typographyId:"editorial" as const,heroImage:null}}};
    const html=renderPublicSiteHtml(page);
    expect(html).not.toContain("original-artwork");
    expect(html).not.toContain("data:image/svg+xml,");
    const about=renderPublicSiteHtml(page,{path:"/about"});
    expect(about).not.toContain("original-artwork");
    expect(about).not.toContain("data:image/svg+xml,");
  });

  it("renders independently approved staff identities and a grounded FAQ, without raw roster details",()=>{
    const base={host:"test.can-os.com",site:{name:"Community School",organizationName:"Community"},offerings:[],
      academicPrograms:[{programId:"program1",title:"Learning Program",typeLabel:"School",
        summary:"A reviewed program",grades:{min:"K",max:"5"},
        delivery:{onsite:true,liveOnline:false,asynchronous:true,onsiteDaysPerWeek:2},
        availability:"planned" as const}],
      localContent:{...emptySiteLocalContent,welcomeMessage:"Welcome",localDescription:"Our story",
        churchHistory:"An authentic story",branding:{theme:"classic" as const,heroImage:null}}};
    const profile=projectApprovedParentInformation({site:base.site,
      academicPrograms:base.academicPrograms,offerings:[],localContent:base.localContent,
      people:[{displayName:"Ms. <River>",publicTitle:"School Director",biography:"A reviewed, consented public introduction."}],
      admissions:{applicationOpen:false,description:verifiedPublicClaim("Application details are being reviewed.","admissions")},
    });
    const about=renderPublicSiteHtml({...base,parentInformation:profile},{path:"/about"});
    expect(about).toContain("Meet our school community");
    expect(about).toContain("Ms. &lt;River&gt;");
    expect(about).not.toContain("personId");
    const faq=renderPublicSiteHtml({...base,parentInformation:profile},{path:"/faq"});
    expect(faq).toContain("Frequently asked questions");
    expect(faq).toContain("Which programs and grades are available?");
    expect(faq).toContain("Applications are not currently open");
    expect(faq).not.toContain("Tuition is free");
    expect(availablePublicSitePaths({...base,parentInformation:profile})).toContain("/tuition");
    const tuition=renderPublicSiteHtml({...base,parentInformation:profile},{path:"/tuition"});
    expect(tuition).toContain("Reviewed tuition and fee details have not yet been published");
    expect(tuition).toContain("Reviewed financial assistance details are not yet available");
    expect(tuition).toContain('href="/academics"');
    expect(tuition).not.toContain("Tuition is free");
    expect(faq).toContain("Request current details for your program");
    const academics=renderPublicSiteHtml({...base,parentInformation:profile},{path:"/academics"});
    expect(academics).toContain("How learning is organized");
    expect(academics).toContain("Self-paced online learning");
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

  it("renders only the matching approved Program weekly calendar including Sunday", () => {
    const site = {name: "Two Program School", organizationName: "Church"};
    const academicPrograms = [
      {programId: "school-a", title: "Elementary", typeLabel: "School",
        summary: "Elementary study", grades: {min: "K", max: "5"},
        delivery: {onsite:true, asynchronous:false, liveOnline:false, onsiteDaysPerWeek:2},
        availability: "planned" as const},
      {programId: "school-b", title: "High School", typeLabel: "Hybrid",
        summary: "Secondary study", grades: {min: "9", max: "12"},
        delivery: {onsite:true, asynchronous:true, liveOnline:true, onsiteDaysPerWeek:3},
        availability: "planned" as const},
    ];
    const profile = Object.assign(projectApprovedParentInformation({
      site, academicPrograms, offerings:[],localContent:null,
    }), {programSchedules: [{
      programId:"school-a",
      name:verifiedPublicClaim("Elementary","program_publication"),
      grades:verifiedPublicClaim({min:"K",max:"5"},"program_publication"),
      timezone:verifiedPublicClaim("America/Los_Angeles","calendar"),
      effectiveFrom:verifiedPublicClaim("2027-01-01","calendar"),
      effectiveThrough:unconfiguredClaim<string>("calendar"),
      weeklyPattern:verifiedPublicClaim([
        {dayOfWeek:0,startsAtLocal:"10:00",endsAtLocal:"13:00",timezone:"America/Los_Angeles"},
        {dayOfWeek:3,startsAtLocal:"09:00",endsAtLocal:"14:00",timezone:"America/Los_Angeles"},
      ],"calendar"),
    }]});
    const html = renderPublicSiteHtml({
      host:"two.can-os.com",site,offerings:[],academicPrograms,parentInformation:profile,
    },{path:"/school-day"});
    expect(html).toContain("Approved weekly learning schedule");
    expect(html).toContain("<strong>Sunday</strong>");
    expect(html).toContain("10:00–13:00");
    expect(html).toContain("Effective from 2027-01-01");
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("Exact schedules and days are confirmed by the school");
    expect(html).not.toContain("Published learning days and hours");
    profile.programSchedules[0]!.weeklyPattern.canDisplay=false;
    const withdrawn = renderPublicSiteHtml({
      host:"two.can-os.com",site,offerings:[],academicPrograms,parentInformation:profile,
    },{path:"/school-day"});
    expect(withdrawn).not.toContain("<strong>Sunday</strong>");
    expect(withdrawn).not.toContain("10:00–13:00");
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
    expect(availablePublicSitePaths(page)).toContain("/school-day");
    expect(availablePublicSitePaths(page)).toContain("/admissions");
    expect(availablePublicSitePaths(page)).not.toContain("/student-life");
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
    }, { ...opts, localPreview: true, localPreviewSlug: "academy",
      localPreviewSubmissionsEnabled: true });
    expect(localPreview).toContain("Hybrid Academy");
    expect(localPreview).toContain("Local preview. Eligible inquiry forms submit to the development database");
    expect(localPreview).toContain("Applications available · identity verification required");
    expect(localPreview).toContain('action="/published-site/family-start?site=academy"');
    expect(localPreview).toContain('action="/published-site/inquiry?site=academy"');
    expect(localPreview).not.toContain('action="/apply"');
    expect(localPreview).not.toContain('action="/inquiry"');
    const readOnly = renderPublicSiteHtml(page, { ...opts, localPreview: true,
      localPreviewSlug: "academy" });
    expect(readOnly).toContain("Private website preview. Forms are disabled.");
    expect(readOnly).not.toContain("<form");
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
    expect(admissions).toContain("Reviewed public authorization, licensure, accreditation and jurisdiction statements have not yet been published");
    expect(admissions).toContain("absence is not evidence");
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
    expect(demonstration).toContain("Fictional Learning Academy is fictional.");
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
    expect(ordinary).not.toContain("Helping students discover who they are and what they can become.");
    const story = renderPublicSiteHtml({...page, localContent: {
      welcomeMessage: "Come learn with us.", localDescription: "",
      denomination: "", statementOfFaith: "", spiritualFormation: "",
      schoolVision: "Growth, curiosity & community.",
      branding: {theme: "classic" as const, heroImage: null},
    }});
    expect(story).toContain("Helping students discover who they are and what they can become.");
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

it("connects all twelve editorial photo roles to fictional school pages only when library readiness is enabled",()=> {
  const prior=process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED;
  process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED="true";
  try {
    const page=withIllustrativeLocalPreview({
      host:"showcase.can-os.com",
      site:{name:"Showcase Academy",organizationName:"Partner"},
      offerings:[],demonstration:true,
    });
    const all=availablePublicSitePaths(page).map(path=>
      renderPublicSiteHtml(page,{path})).join("\n");
    for(const role of ["hero","story_01","story_02","program_01",
      "program_02","program_03","community_01","community_02",
      "admissions","portrait_01","portrait_02","portrait_03"]) {
      expect(all).toContain(`/template-photo/heritage/${role}?v=20261109`);
    }
    expect((all.match(/class="demo-banner"/g)??[])).toHaveLength(10);
    expect(all).not.toContain("Demonstration only");
    expect(all).not.toContain("Illustrative template photography");
    expect(all).not.toContain("<form");
    expect(all).toContain('content="noindex,nofollow"');
  } finally {
    if(prior===undefined)delete process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED;
    else process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED=prior;
  }
});

it("uses explicit sample photography only in the fictional private template preview",()=>{
 const page={host:"valorschool.can-os.com",site:{name:"Valor School",organizationName:"School"},offerings:[],demonstration:true};
 const preview=renderPublicSiteHtml(page,{localPreview:true,sampleTemplate:"heritage"});
 expect(preview).toContain("/template-photo/heritage/hero?v=20261109");
 expect(preview).not.toContain("data:image/svg+xml,");
 const publishedDemo=renderPublicSiteHtml(page,{sampleTemplate:"heritage"});
 expect(publishedDemo).toContain("/school-template-previews/v1/heritage/hero.jpg");
 expect(publishedDemo).not.toContain("/template-photo/");
 expect(renderPublicSiteHtml({...page,demonstration:false},{localPreview:true,sampleTemplate:"heritage"})).not.toContain("/school-template-previews/");
});
