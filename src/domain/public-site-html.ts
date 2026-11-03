import { resolveSiteTheme } from "./site-theme";
import { type PublicSitePath } from "./public-site-paths";
import type { PublicParentSchoolProfile } from "./parent-information";
import type { PublicAcademicProgram } from "./academic-program-publication";
import { normalizeSiteLocalContent, type SiteLocalContent } from "./site-local-content";

/** Standalone, escaped HTML. No hydration, external scripts or CAN OS shell. */
type PublicOffering = ReturnType<typeof import("./public-site-catalog").toPublicSiteEnrichment>;
export type PublicSitePage = {
  host: string;
  site: { name: string; organizationName: string };
  offerings: PublicOffering[];
  academicPrograms?: PublicAcademicProgram[];
  /** Only institutionally reviewed claims with public display permission are rendered. */
  parentInformation?: PublicParentSchoolProfile;
  /** Locally authored church copy, separately versioned and safety screened. */
  localContent?: SiteLocalContent | null;
};

export function escapePublicHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(cents / 100);
}

/** Navigation is derived from available approved facts; missing sections are never linked. */
export function availablePublicSitePaths(page: PublicSitePage): PublicSitePath[] {
  const local = page.localContent;
  const hasStory = Boolean(local && [local.localDescription, local.churchHistory, local.communityOutreach,
    local.schoolVision, local.leadershipWelcome, local.localTraditions, local.denomination,
    local.statementOfFaith, local.spiritualFormation, local.branding?.heroImage].some(Boolean));
  const academic = Boolean(page.academicPrograms?.length);
  const parent = page.parentInformation;
  const tuition = Boolean(parent?.tuition.description.canDisplay && parent.tuition.description.value);
  const services = Boolean(parent?.services.some(service => service.description.canDisplay && service.description.value));
  const faq = Boolean(parent?.admissions.description.canDisplay && parent.admissions.description.value);
  return ["/", ...(hasStory ? ["/about"] as const : []),
    ...(academic ? ["/academics", "/school-day", "/admissions"] as const : []),
    ...(page.offerings.length ? ["/student-life"] as const : []),
    ...(tuition ? ["/tuition"] as const : []),
    ...(services ? ["/families"] as const : []),
    ...(faq ? ["/faq"] as const : []), "/contact"];
}

export function renderPublicSiteHtml(page: PublicSitePage, options?: {
  /** Caller supplies one server-generated random request ID per form. */
  makeRequestId?: () => string;
  path?: PublicSitePath;
}): string {
  const path = options?.path ?? "/";
  const availablePaths = availablePublicSitePaths(page);
  if (!availablePaths.includes(path)) throw new Error("This public page is not available");
  const school = escapePublicHtml(page.site.name);
  const org = escapePublicHtml(page.site.organizationName);
  const host = escapePublicHtml(page.host);
  const local = page.localContent ? normalizeSiteLocalContent(page.localContent) : null;
  const theme = local?.branding.theme ?? "classic";
  const visual = resolveSiteTheme(local?.branding.paletteId, local?.branding.typographyId);
  const visualCss = `--site-ink:${visual.ink};--site-paper:${visual.canvas};--site-accent:${visual.accent};--site-secondary:${visual.secondary};--site-muted:${visual.muted};--site-display:${visual.displayFont};--site-body:${visual.bodyFont};`;
  const localItems = local ? [
    ["Our story", local.churchHistory],
    ["Serving our community", local.communityOutreach],
    ["Why we started a school", local.schoolVision],
    ["A welcome from our leadership", local.leadershipWelcome],
    ["Local traditions", local.localTraditions],
    ["Our community", local.localDescription],
    ["Denominational identity", local.denomination],
    ["Statement of faith", local.statementOfFaith],
    ["Spiritual formation", local.spiritualFormation],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim())) : [];
  const image = local?.branding.heroImage;
  const pageLabels: Record<PublicSitePath, string> = {
    "/": "Home", "/about": "About", "/academics": "Academics",
    "/student-life": "Student life", "/school-day": "School day",
    "/admissions": "Admissions", "/tuition": "Tuition", "/families": "Families",
    "/faq": "Questions", "/contact": "Contact",
  };
  const navigation = availablePaths.map(destination =>
    `<a href="${destination}"${destination === path ? ' aria-current="page"' : ""}>${pageLabels[destination]}</a>`
  ).join(" ");
  const localSection = localItems.length || image ? `<section aria-labelledby="church-identity-title" class="church-section">
    <p class="tag">Content provided by the local church</p>
    <h2 id="church-identity-title">Our church and community</h2>
    ${image ? `<img class="local-hero-image" src="${escapePublicHtml(image.dataUrl)}"
      alt="${escapePublicHtml(image.altText)}" loading="lazy" decoding="async"/>` : ""}
    ${localItems.map(([label, value]) => `<div class="local-field">
      <h3>${escapePublicHtml(label)}</h3>
      <p>${escapePublicHtml(value)}</p>
    </div>`).join("\n")}
    <p class="availability">Local religious and community information reflects the church partner.
    Academic, enrollment and institutional statements are managed separately by CAN.</p>
  </section>` : "";
  const academicCards = (page.academicPrograms ?? []).map(program => {
    const modes = [
      program.delivery.onsite ? "Onsite" : null,
      program.delivery.liveOnline ? "Live online" : null,
      program.delivery.asynchronous ? "Self-paced online" : null,
    ].filter(Boolean).join(" · ");
    const onsiteDays = program.delivery.onsiteDaysPerWeek;
    const requestId = options?.makeRequestId?.();
    const applyRequestId = program.applicationOpen === true ? options?.makeRequestId?.() : undefined;
    // Only the separately authorized school-of-record/admissions projection
    // can expose Apply. A live Program is NOT automatically an open school.
    // The receiving command rechecks operating authority at submission.
    const applicationForm = program.applicationOpen === true && applyRequestId ?
      `<form action="/apply" method="post" class="inquiry-form">
        <h4>Start your school application</h4>
        <p class="availability">Verify your email first. No child information is
          collected on this public page, and guardian authority is reviewed by the school.</p>
        <input type="hidden" name="requestId" value="${escapePublicHtml(applyRequestId)}"/>
        <input type="hidden" name="programId" value="${escapePublicHtml(program.programId)}"/>
        <label>Parent or guardian first name<input name="firstName" autocomplete="given-name" maxlength="80" required/></label>
        <label>Parent or guardian last name<input name="lastName" autocomplete="family-name" maxlength="80" required/></label>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required/></label>
        <div aria-hidden="true" class="bot-field"><label>Website<input name="website" tabindex="-1" autocomplete="off"/></label></div>
        <label class="consent"><input type="checkbox" name="contactConsent" value="yes" required/>
          I agree to receive an email verification link to begin or resume my application.
        </label>
        <button type="submit">Verify email to apply</button>
      </form>` : "";
    const inquiryForm = requestId ? `<form action="/inquiry" method="post" class="inquiry-form">
        <input type="hidden" name="requestId" value="${escapePublicHtml(requestId)}"/>
        <input type="hidden" name="programId" value="${escapePublicHtml(program.programId)}"/>
        <label>First name<input name="firstName" autocomplete="given-name" maxlength="80" required/></label>
        <label>Last name<input name="lastName" autocomplete="family-name" maxlength="80" required/></label>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required/></label>
        <label>Question (optional; please do not include student information)
          <textarea name="message" maxlength="500" rows="2"></textarea>
        </label>
        <div aria-hidden="true" class="bot-field">
          <label>Website<input name="website" tabindex="-1" autocomplete="off"/></label>
        </div>
        <label class="consent"><input type="checkbox" name="contactConsent" value="yes" required/>
          I agree to be contacted about this program. This is not an application or enrollment request.
        </label>
        <button type="submit">Request information</button>
      </form>` : "";
    return `<article class="card">
      <p class="tag">${escapePublicHtml(program.typeLabel)}</p>
      <h3>${escapePublicHtml(program.title)}</h3>
      <p class="season">Grades ${escapePublicHtml(program.grades.min)}–${escapePublicHtml(program.grades.max)}</p>
      <p>${escapePublicHtml(program.summary)}</p>
      <p class="availability">${escapePublicHtml(modes || "Delivery details available by inquiry")}
        ${onsiteDays !== null && program.delivery.onsite ? ` · ${onsiteDays} onsite days per week` : ""}
      </p>
      <p class="availability">${program.applicationOpen === true
        ? "Applications available · identity verification required"
        : program.availability === "planned"
          ? "Program planned · admissions not open on this page"
          : "Current program · applications not currently available"}</p>
      ${applicationForm}
      ${inquiryForm}
    </article>`;
  }).join("\n");
  const cards = page.offerings.map(item => {
    const price = item.packages.length
      ? Math.min(...item.packages.map(option => option.priceCents))
      : item.feeAmountCents;
    const priceLabel = item.packages.length ? "Starting at " : "";
    const registrationStatus = !item.registrationOpen
      ? "Registration window not open"
      : item.seatsRemaining === 0
        ? "Waitlist may be available"
        : item.seatsRemaining === null
          ? "Registration window open"
          : `${item.seatsRemaining} seats remaining`;
    return `<article class="card">
      <p class="tag">${escapePublicHtml(item.programName)}</p>
      <h3>${escapePublicHtml(item.title)}</h3>
      <p class="season">${escapePublicHtml(item.season)} · ${escapePublicHtml(item.startsOn)} – ${escapePublicHtml(item.endsOn)}</p>
      <p class="price">${priceLabel}${escapePublicHtml(money(price))}</p>
      <p class="availability">${escapePublicHtml(registrationStatus)}</p>
    </article>`;
  }).join("\n");
  const hasOpenApplications = (page.academicPrograms ?? []).some(program => program.applicationOpen === true);
  const hero = `<div id="welcome" class="public-hero${image ? " has-image" : ""}"${image ? ` style="background-image:linear-gradient(95deg,rgba(13,34,40,.93),rgba(13,34,40,.54)),url(&quot;${escapePublicHtml(image.dataUrl)}&quot;)"` : ""}><p class="tag">Welcome to our school</p><h1>${school}</h1>
    ${local?.welcomeMessage ? `<p class="intro">${escapePublicHtml(local.welcomeMessage)}</p>` : ""}
    <p class="intro">Explore the local community and reviewed educational programs.
    ${hasOpenApplications ? "Applications are available for eligible approved programs, subject to verification." :
      "Request information about our programs. Applications are not currently open through this website."}</p>
    <div class="hero-actions">${availablePaths.includes("/academics") ? `<a class="hero-button" href="/academics">Explore academics</a>` : ""}
    ${availablePaths.includes("/about") ? `<a class="hero-text-link" href="/about">Our story →</a>` : ""}</div></div>`;
  const academicSection = academicCards ? `<section aria-labelledby="academic-title" class="editorial-section">
    <h2 id="academic-title">Academic programs</h2><div class="grid">${academicCards}</div></section>` : "";
  const enrichmentSection = `<section aria-labelledby="programs-title" class="editorial-section">
    <h2 id="programs-title">Enrichment and student experiences</h2>
    ${cards ? `<div class="grid">${cards}</div>` : academicCards
      ? '<p class="intro">No enrichment opportunities are currently listed.</p>'
      : '<p class="empty">There are no programs to display at this time.</p>'}</section>`;
  const contactSection = `<section id="contact" aria-labelledby="contact-title" class="church-section">
    <h2 id="contact-title">Connect with our school</h2>
    <p>${academicCards ? "For program questions, use the request-information form on the academic listing." :
      "Academic inquiries become available when an approved program is published."}
    An inquiry does not guarantee admission or enrollment.</p></section>`;
  const schoolDay = (page.academicPrograms ?? []).map(program => {
    const days = program.delivery.onsiteDaysPerWeek;
    const modes = [
      program.delivery.onsite ? "Onsite learning" : null,
      program.delivery.liveOnline ? "Live online learning" : null,
      program.delivery.asynchronous ? "Self-paced online learning" : null,
    ].filter(Boolean).join(" · ");
    return `<article class="card"><h3>${escapePublicHtml(program.title)}</h3>
      <p>${escapePublicHtml(modes || "Contact the school for delivery details")}</p>
      ${program.delivery.onsite && days !== null ? `<p>${days} onsite days per week</p>` : ""}
      <p class="availability">Exact schedules and days are confirmed by the school; this overview
      does not imply a Monday–Friday schedule or that the program is operating.</p></article>`;
  }).join("");
  const parent = page.parentInformation;
  const verifiedText = (claim: { canDisplay: boolean; value: string | null } | undefined) =>
    claim?.canDisplay && claim.value ? escapePublicHtml(claim.value) : "";
  const tuitionText = verifiedText(parent?.tuition.description);
  const aidText = verifiedText(parent?.tuition.financialAid);
  const tuitionSection = tuitionText ? `<section class="church-section" aria-labelledby="tuition-title">
    <h2 id="tuition-title">Tuition and costs</h2><p>${tuitionText}</p>
    ${aidText ? `<h3>Financial assistance</h3><p>${aidText}</p>` : ""}</section>` : "";
  const serviceCards = parent?.services.filter(item => item.description.canDisplay && item.description.value)
    .map(item => `<article class="card"><h3>${escapePublicHtml(item.category.replace(/_/g, " "))}</h3>
      <p>${verifiedText(item.description)}</p></article>`).join("") ?? "";
  const admissionExplanation = verifiedText(parent?.admissions.description);
  const secondaryHero = (eyebrow: string, title: string, summary: string) =>
    `<div class="public-hero compact-hero"><p class="tag">${eyebrow}</p><h1>${title}</h1><p class="intro">${summary}</p></div>`;
  const pageContent: Record<PublicSitePath, string> = {
    "/": hero + (local?.schoolVision || local?.localDescription ? `<section class="mission-split editorial-section" aria-labelledby="mission-title"><div><p class="tag">Rooted in this community</p><h2 id="mission-title">An education with a sense of place</h2></div><p>${escapePublicHtml(local.schoolVision || local.localDescription)}</p></section>` : "") + academicSection + (page.offerings.length ? enrichmentSection : (!academicCards ? `<p class="empty" role="status">There are no programs to display at this time.</p>` : "")) + localSection + (academicCards ? `<section class="closing-action"><p class="tag">Find your next step</p><h2>Discover the right learning path</h2><p>Explore published programs and request details before making an enrollment decision.</p><a href="/academics" class="hero-button">Explore approved programs</a></section>` : "") + contactSection,
    "/about": secondaryHero("Our community", "A school rooted in community",
      "Learn about the church and local people behind this school.") + localSection,
    "/academics": secondaryHero("Learning", "Academic programs",
      "Explore institutionally reviewed program information and delivery options.") + academicSection,
    "/student-life": secondaryHero("Beyond the classroom", "Student life",
      "See currently published enrichment and activities.") + enrichmentSection,
    "/school-day": secondaryHero("Learning together", "A look at the school day",
      "Program-specific delivery patterns, not a promised daily timetable.") +
      `<section aria-label="Program delivery patterns" class="grid">${schoolDay}</section>`,
    "/admissions": secondaryHero("For families", "Admissions and next steps",
      "Explore eligible programs. Applications are available only when separately authorized.") +
      academicSection,
    "/tuition": secondaryHero("Planning your education", "Tuition and financial information",
      "Only officially approved tuition information appears here.") + tuitionSection,
    "/families": secondaryHero("Supporting families", "Family services",
      "Services shown here have been reviewed for public description.") +
      `<section aria-label="Verified family services" class="grid">${serviceCards}</section>`,
    "/faq": secondaryHero("Common questions", "Questions about joining",
      "Verified guidance from the school.") +
      `<section class="church-section" aria-labelledby="faq-admissions"><h2 id="faq-admissions">How does admissions work?</h2>
      <p>${admissionExplanation}</p></section>`,
    "/contact": secondaryHero("Get in touch", "Connect with our school",
      "Start with an approved program inquiry when available.") + contactSection + academicSection,
  };
  const pageTitle = path === "/" ? `${school} | Programs` :
    `${escapePublicHtml(pageLabels[path])} | ${school}`;
  const pageDescription = path === "/" ? `Explore programs offered through ${school}.` :
    `Explore ${escapePublicHtml(pageLabels[path].toLowerCase())} at ${school}.`;
  const isLive = Boolean(options?.makeRequestId);
  const canonical = `https://${host}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="${isLive ? "index,follow" : "noindex,nofollow"}"/>
${isLive ? `<link rel="canonical" href="${canonical}"/>` : ""}
<title>${pageTitle}</title>
<meta name="description" content="${pageDescription}"/>
<style>
:root{font-family:var(--site-body);color:var(--site-ink);background:var(--site-paper);line-height:1.65}
body.theme-warm,body.theme-light{color:var(--site-ink);background:var(--site-paper)}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1240px;margin:auto;padding-left:clamp(20px,4vw,52px);padding-right:clamp(20px,4vw,52px)}
header{padding-top:24px;padding-bottom:22px;border-bottom:1px solid #dce2e8;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
.brand{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#3b5365;line-height:1.6}
h1{font-family:var(--site-display);font-size:clamp(2.8rem,7vw,6.25rem);letter-spacing:-.055em;margin:18px 0 14px;line-height:1.07;max-width:850px}
h2{font-family:var(--site-display);font-size:clamp(1.7rem,3.5vw,2.65rem);font-weight:500;letter-spacing:-.038em;margin:0 0 18px}.intro{color:#475467;max-width:700px;line-height:1.6}
main{padding-top:38px;padding-bottom:112px}main>section+section{margin-top:clamp(48px,8vw,112px)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #e6e2d9;border-radius:18px;padding:clamp(24px,3vw,34px);background:#fff;box-shadow:0 12px 40px rgba(22,43,66,.055)}
.card h3{font-family:var(--site-display);font-size:1.45rem;font-weight:500;line-height:1.22;margin:12px 0}
.tag{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:#475467;font-weight:700}
.season,.availability{font-size:.9rem;color:#475467;line-height:1.5}
.price{font-weight:700;font-size:1.16rem;margin-top:20px}
.empty{padding:28px;border:1px solid #dce2e8;border-radius:14px;background:white}
.church-section{border:1px solid #e5e2d9;border-radius:22px;padding:clamp(24px,5vw,64px);background:#fff;margin-bottom:48px}.church-section>.local-field{max-width:780px;padding:22px 0;border-top:1px solid #eeece7}.church-section>.local-field:first-of-type{border-top:0}.church-section>.local-field h3{font-family:Georgia,Cambria,serif;font-size:1.35rem;font-weight:500}
.local-field{margin-top:18px}.local-field h3{font-size:1rem;margin:0 0 6px}
.local-field p{white-space:pre-line;overflow-wrap:anywhere;color:#475467;line-height:1.6;margin:0}
.local-hero-image{display:block;width:100%;max-height:420px;object-fit:cover;border-radius:14px;margin:18px 0 24px}
footer{border-top:1px solid #dce2e8;padding-top:22px;padding-bottom:40px;font-size:.82rem;color:#667085}
.inquiry-form{margin-top:22px;padding-top:18px;border-top:1px solid #dce2e8;display:grid;gap:12px}
.inquiry-form label{display:grid;gap:5px;font-size:.82rem;color:#475467}
.inquiry-form input:not([type=checkbox]),.inquiry-form textarea{width:100%;padding:10px;border:1px solid #bcc6d2;border-radius:8px;font:inherit}
.inquiry-form .consent{display:flex;align-items:start;gap:8px;line-height:1.4}
.inquiry-form button{background:#173c60;color:white;border:none;border-radius:10px;padding:14px;font-weight:700;cursor:pointer;min-height:44px}
.inquiry-form button:hover{background:#245b88}
:focus-visible{outline:3px solid #e7a84e;outline-offset:3px}
.public-hero{min-height:440px;position:relative;isolation:isolate;overflow:hidden;border-radius:28px;background:linear-gradient(110deg,var(--site-ink),var(--site-secondary));padding:clamp(30px,6vw,70px);color:white;margin-bottom:52px}
.public-hero h1{color:white}.public-hero .intro{color:#edf3f8;max-width:670px}
.public-hero::after{content:"";position:absolute;inset:0;z-index:-1;background:var(--site-accent);opacity:.18;clip-path:polygon(0 100%,0 88%,32% 70%,56% 90%,78% 53%,100% 66%,100% 100%)}.public-hero.has-image{background-position:center;background-size:cover}.public-hero.has-image::after{display:none}
.public-hero .tag{color:#e7d7bd}.hero-actions{display:flex;align-items:center;flex-wrap:wrap;gap:20px;margin-top:30px}.hero-button{display:inline-flex;align-items:center;min-height:48px;border-radius:10px;padding:12px 19px;background:#f6eee0;color:#17364d;text-decoration:none;font-weight:700}.hero-text-link{color:#fff;text-underline-offset:5px;font-weight:700}.hero-button:hover{background:#fff}.hero-button:focus-visible,.hero-text-link:focus-visible{outline:3px solid #ffda90;outline-offset:4px}
.skip-link{position:absolute;left:12px;top:-100px;z-index:10;padding:12px;background:#fff;color:#112d34}.skip-link:focus{top:12px}.mission-split{display:grid;grid-template-columns:1fr 1fr;align-items:start;gap:clamp(24px,5vw,80px);padding:clamp(20px,4vw,42px) 0}.mission-split p:last-child{font-size:clamp(1.05rem,1.6vw,1.3rem);line-height:1.75}.editorial-section>.grid{gap:20px}.closing-action{background:var(--site-ink);color:#fff;padding:clamp(30px,6vw,70px);border-radius:12px}.closing-action .tag,.closing-action p{color:#fff}.closing-action h2{max-width:700px}.closing-action .hero-button{margin-top:15px}header nav a{min-height:44px;display:inline-flex;align-items:center}header .brand{color:var(--site-ink)}header{position:relative}header nav{gap:clamp(8px,1.4vw,20px)}.card{border-radius:8px}.card p{overflow-wrap:anywhere}.public-hero{border-radius:12px}.church-section{border-radius:8px}.public-hero h1{overflow-wrap:anywhere} .mobile-menu{display:none} .mobile-menu summary{cursor:pointer;min-height:44px;display:flex;align-items:center;padding:8px 14px;border:1px solid var(--site-ink);border-radius:6px}.mobile-menu a{display:block;padding:11px 4px;min-height:44px} .mobile-menu[open]{width:100%} .mobile-menu[open] .mobile-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px} @media(max-width:800px){header>.desktop-nav{display:none}.mobile-menu{display:block} .mission-split{grid-template-columns:1fr} .public-hero{min-height:350px}} @media(max-width:600px){.grid{grid-template-columns:1fr}.public-hero{border-radius:18px;min-height:0}.card{padding:22px}header{align-items:flex-start}header nav{order:3;width:100%;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap;padding-top:12px}main{padding-top:24px;padding-bottom:60px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
.bot-field{display:none}
header nav{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem}header nav a[aria-current=page]{font-weight:800;text-decoration-thickness:2px}.compact-hero{padding-block:clamp(28px,5vw,52px)}.compact-hero h1{font-size:clamp(2.3rem,5vw,4rem)}header nav a{color:inherit;text-underline-offset:5px;text-decoration-color:#9ca9ab}header nav a:hover{text-decoration-color:currentColor}html{scroll-behavior:smooth}
</style>
</head>
<body class="theme-${theme}" style="${visualCss}">
<a class="skip-link" href="#main-content">Skip to main content</a>
<header><p class="brand">${school}</p><nav class="desktop-nav" aria-label="School website navigation">${navigation}</nav><details class="mobile-menu"><summary>Menu</summary><nav class="mobile-links" aria-label="Mobile school navigation">${navigation}</nav></details></header>
<main id="main-content">\n  ${pageContent[path]}\n</main>
<footer><strong>${school}</strong> · ${org} <span class="platform-credit"> · Supported by CAN Academy · ${host}</span></footer>
</body>
</html>`;
}
