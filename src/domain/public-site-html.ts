import type { PublicAcademicProgram } from "./academic-program-publication";

/** Standalone, escaped HTML. No hydration, external scripts or CAN OS shell. */
type PublicOffering = ReturnType<typeof import("./public-site-catalog").toPublicSiteEnrichment>;
export type PublicSitePage = {
  host: string;
  site: { name: string; organizationName: string };
  offerings: PublicOffering[];
  academicPrograms?: PublicAcademicProgram[];
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
  const academicCards = (page.academicPrograms ?? []).map(program => {
    const modes = [
      program.delivery.onsite ? "Onsite" : null,
      program.delivery.liveOnline ? "Live online" : null,
      program.delivery.asynchronous ? "Self-paced online" : null,
    ].filter(Boolean).join(" · ");
    const onsiteDays = program.delivery.onsiteDaysPerWeek;
    const requestId = options?.makeRequestId?.();
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
      <p class="availability">${program.availability === "planned"
        ? "Program planned · admissions not open on this page"
        : "Current program · contact the Site about admissions"}</p>
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
<meta name="robots" content="noindex,nofollow"/>
<title>${school} | Programs</title>
<meta name="description" content="Explore programs offered through ${school}."/>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#1d2939;background:#f7f8fa}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1024px;margin:auto;padding:0 24px}
header{padding-top:28px;padding-bottom:24px;border-bottom:1px solid #dce2e8}
.brand{font-size:.75rem;letter-spacing:.13em;text-transform:uppercase;font-weight:700;color:#475467}
h1{font-size:clamp(2.2rem,6vw,4rem);letter-spacing:-.04em;margin:18px 0 8px;line-height:1.1}
h2{font-size:1.55rem;margin:0 0 10px}.intro{color:#475467;max-width:700px;line-height:1.6}
main{padding-top:42px;padding-bottom:64px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #dce2e8;border-radius:14px;padding:24px;background:white}
.card h3{font-size:1.28rem;line-height:1.3;margin:12px 0}
.tag{font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;color:#475467;font-weight:700}
.season,.availability{font-size:.9rem;color:#475467;line-height:1.5}
.price{font-weight:700;font-size:1.16rem;margin-top:20px}
.empty{padding:28px;border:1px solid #dce2e8;border-radius:14px;background:white}
footer{border-top:1px solid #dce2e8;padding-top:22px;padding-bottom:40px;font-size:.82rem;color:#667085}
.inquiry-form{margin-top:22px;padding-top:18px;border-top:1px solid #dce2e8;display:grid;gap:12px}
.inquiry-form label{display:grid;gap:5px;font-size:.82rem;color:#475467}
.inquiry-form input:not([type=checkbox]),.inquiry-form textarea{width:100%;padding:10px;border:1px solid #bcc6d2;border-radius:8px;font:inherit}
.inquiry-form .consent{display:flex;align-items:start;gap:8px;line-height:1.4}
.inquiry-form button{background:#1d2939;color:white;border:none;border-radius:8px;padding:12px;font-weight:700;cursor:pointer}
.bot-field{display:none}
</style>
</head>
<body>
<header><p class="brand">CAN Academy · Local partner site</p><p>${org}</p></header>
<main>
  <h1>${school}</h1>
  <p class="intro">Discover academic and enrichment opportunities at this location.
  Listings are reviewed marketing information, not accreditation, admission or
  registration approvals.</p>
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
</main>
<footer>${host} · Powered by CAN OS</footer>
</body>
</html>`;
}
