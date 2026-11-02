import type { PublicAcademicProgram } from "./academic-program-publication";
import { normalizeSiteLocalContent, type SiteLocalContent } from "./site-local-content";

/** Standalone, escaped HTML. No hydration, external scripts or CAN OS shell. */
type PublicOffering = ReturnType<typeof import("./public-site-catalog").toPublicSiteEnrichment>;
export type PublicSitePage = {
  host: string;
  site: { name: string; organizationName: string };
  offerings: PublicOffering[];
  academicPrograms?: PublicAcademicProgram[];
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

export function renderPublicSiteHtml(page: PublicSitePage, options?: {
  /** Caller supplies one server-generated random request ID per form. */
  makeRequestId?: () => string;
}): string {
  const school = escapePublicHtml(page.site.name);
  const org = escapePublicHtml(page.site.organizationName);
  const host = escapePublicHtml(page.host);
  const local = page.localContent ? normalizeSiteLocalContent(page.localContent) : null;
  const theme = local?.branding.theme ?? "classic";
  const localItems = local ? [
    ["Our community", local.localDescription],
    ["Denominational identity", local.denomination],
    ["Statement of faith", local.statementOfFaith],
    ["Spiritual formation", local.spiritualFormation],
  ].filter((item): item is [string, string] => Boolean(item[1]?.trim())) : [];
  const image = local?.branding.heroImage;
  const navigation = [
    `<a href="#welcome">Welcome</a>`,
    ...(localItems.length || image ? [`<a href="#church-identity-title">Our community</a>`] : []),
    ...((page.academicPrograms ?? []).length ? [`<a href="#academic-title">Academics</a>`] : []),
    `<a href="#programs-title">Enrichment</a>`,
    `<a href="#contact">Contact</a>`,
  ].join(" ");
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="index,follow"/>
<title>${school} | Programs</title>
<meta name="description" content="Explore programs offered through ${school}."/>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#193047;background:#f6f8fa;line-height:1.5}
body.theme-warm{color:#422f28;background:#fbf6ef}body.theme-light{color:#24313b;background:#fff}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1160px;margin:auto;padding-left:clamp(20px,5vw,64px);padding-right:clamp(20px,5vw,64px)}
header{padding-top:24px;padding-bottom:22px;border-bottom:1px solid #dce2e8;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
.brand{font-size:.75rem;letter-spacing:.13em;text-transform:uppercase;font-weight:700;color:#475467}
h1{font-family:Georgia,serif;font-size:clamp(2.8rem,6vw,5.3rem);letter-spacing:-.055em;margin:18px 0 14px;line-height:1.07;max-width:850px}
h2{font-size:1.55rem;margin:0 0 10px}.intro{color:#475467;max-width:700px;line-height:1.6}
main{padding-top:48px;padding-bottom:80px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #dce2e8;border-radius:20px;padding:clamp(20px,3vw,30px);background:white;box-shadow:0 8px 28px rgba(22,43,66,.045)}
.card h3{font-size:1.28rem;line-height:1.3;margin:12px 0}
.tag{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:#475467;font-weight:700}
.season,.availability{font-size:.9rem;color:#475467;line-height:1.5}
.price{font-weight:700;font-size:1.16rem;margin-top:20px}
.empty{padding:28px;border:1px solid #dce2e8;border-radius:14px;background:white}
.church-section{border:1px solid #dce2e8;border-radius:20px;padding:clamp(22px,4vw,40px);background:#fff;margin-bottom:48px}
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
.public-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:28px;background:linear-gradient(100deg,rgba(9,32,55,.9),rgba(14,51,78,.58)),radial-gradient(ellipse at 85% 35%,#e5ac7b,transparent 55%),linear-gradient(160deg,#5f879b,#203b60);padding:clamp(30px,6vw,70px);color:white;margin-bottom:52px}
.public-hero h1{color:white}.public-hero .intro{color:#edf3f8;max-width:670px}
.public-hero::after{content:"";position:absolute;inset:0;z-index:-1;background:#153b55;opacity:.45;clip-path:polygon(0 100%,0 89%,18% 75%,30% 88%,51% 55%,65% 80%,81% 49%,100% 76%,100% 100%)}
.public-hero .tag{color:#e7d7bd}
@media(max-width:600px){.grid{grid-template-columns:1fr}.public-hero{border-radius:18px}.card{padding:20px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
.bot-field{display:none}
header nav{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem}header nav a{color:inherit;text-underline-offset:4px}html{scroll-behavior:smooth}
</style>
</head>
<body class="theme-${theme}">
<header><p class="brand">CAN Academy · Local partner site</p><nav aria-label="School website navigation">${navigation}</nav><p>${org}</p></header>
<main>
  <div id="welcome" class="public-hero"><p class="tag">Welcome to our school</p><h1>${school}</h1>
  ${local?.welcomeMessage ? `<p class="intro">${escapePublicHtml(local.welcomeMessage)}</p>` : ""}
  <p class="intro">Discover academic and enrichment opportunities at this location.
  Listings are reviewed marketing information, not accreditation, admission or
  registration approvals.</p></div>
  ${localSection}
  ${academicCards ? `<section aria-labelledby="academic-title">
    <h2 id="academic-title">Academic programs</h2>
    <div class="grid">${academicCards}</div>
  </section>` : ""}
  <section aria-labelledby="programs-title" style="margin-top:40px">
    <h2 id="programs-title">Summer and after-school enrichment</h2>
    ${cards ? `<div class="grid">${cards}</div>` : academicCards
      ? '<p class="intro">No enrichment opportunities are currently listed.</p>'
      : '<p class="empty">There are no programs to display at this time.</p>'}
  </section>
  <section id="contact" aria-labelledby="contact-title" class="church-section" style="margin-top:40px"><h2 id="contact-title">Connect with our school</h2><p>${academicCards ? "For academic program questions, use the request-information form on the program listing above." : "Academic inquiries are not available on this website until a school program is published."} An application invitation appears only for an eligible operating program; submitting a request does not guarantee admission.</p></section>
</main>
<footer>${host} · Powered by CAN OS</footer>
</body>
</html>`;
}
