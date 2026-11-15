import { escapePublicHtml } from "./public-site-html";
import { siteLaunchInterestIds, type SiteLaunchPreferences } from "./site-launch-preferences";

/**
 * Private, non-authoritative planning content that supplements the real Site
 * website renderer. Never pass these cards to a public Site catalog.
 */
const plannedInterestLabels: Record<(typeof siteLaunchInterestIds)[number], { title:string; detail:string }> = {
  "grades-6-8": {title:"Grades 6–8",detail:"Exploring middle school curriculum"},
  "grades-9-12": {title:"Grades 9–12",detail:"Exploring high school curriculum"},
  afterschool: {title:"Afterschool",detail:"Exploring programs after the school day"},
  weekend: {title:"Weekend Learning",detail:"Exploring weekend learning programs"},
  summer: {title:"Summer & Breaks",detail:"Exploring seasonal learning experiences"},
  evening: {title:"Evening Learning",detail:"Exploring evening learning programs"},
  adult: {title:"Adult Learning",detail:"Exploring adult education and training"},
  senior: {title:"Senior Programs",detail:"Exploring learning for older adults"},
};

export function renderSiteFirstPrivatePlan(html:string, preferences:SiteLaunchPreferences|null):string {
  const interests = preferences?.interestIds ?? [];
  const cards = interests.map(id => {
    const item = plannedInterestLabels[id];
    return `<article class="can-launch-interest"><p class="can-launch-interest-label">PROPOSED · NOT ENROLLING</p><h3>${escapePublicHtml(item.title)}</h3><p>${escapePublicHtml(item.detail)}</p></article>`;
  }).join("");
  const section = `<section class="can-launch-section" aria-label="Proposed program interests">
    <p class="can-launch-eyebrow">YOUR LEARNING COMMUNITY</p>
    <h2>Programs you are exploring</h2>
    <p class="can-launch-note">These are planning interests, not approved offerings or enrollment opportunities.</p>
    ${cards ? `<div class="can-launch-interest-grid">${cards}</div>` : "<p>Select program interests in Launch Studio to personalize this preview.</p>"}
    </section>`;
  const style = `<style>
    .can-launch-section{margin:40px auto 20px;max-width:1180px;padding:24px;border:1px solid #dce2e8;background:#fff;color:#101d39}
    .can-launch-section h2{font-family:Georgia,serif;font-size:clamp(1.6rem,3vw,2.4rem);margin:8px 0 12px}
    .can-launch-note{font:400 14px/1.6 Arial,sans-serif;color:#52627c}
    .can-launch-eyebrow,.can-launch-interest-label{font:700 11px/1.6 Arial,sans-serif;letter-spacing:.08em;color:#1769ef}
    .can-launch-interest-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:20px}
    .can-launch-interest{border:1px solid #e2e8f0;padding:20px;border-radius:0;background:#f6f8fb}
    .can-launch-interest h3{font:600 18px/1.3 Arial,sans-serif;margin:12px 0 6px}
    .can-launch-interest p:last-child{font:400 13px/1.6 Arial,sans-serif;color:#52627c}
  </style>`;
  const withStyle=html.replace("</head>", `${style}</head>`);
  return withStyle.includes("</main>")
    ? withStyle.replace("</main>", `${section}</main>`)
    : withStyle.replace("</body>", `${section}</body>`);
}

export const siteFirstPreviewHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https://*.can-os.com; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
} as const;
