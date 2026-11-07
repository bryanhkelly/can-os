# CAN School Sites — reference comps and executable visual acceptance
Issued 2026-11-03. Owner: Integration I with Agent B. Source: user-provided `can-school-visual-review-comps(1).zip`.

## Status and source authority
These are **conceptual comps, not working CAN OS screenshots**. Small text, photography, school identity, claims, fees and admissions CTAs are illustrative and not approved source data. The uploaded ZIP is the visual reference artifact; the repository must not copy those photographs into a real customer site without separate rights, guardian-consent and source verification. Screenshots without a matching human-reviewed source reference are not proof of design fidelity.

Reference asset SHA-256 prefixes (to recognize the supplied pack):
- `00-comparison-board.png`: `c85f9ca728d357b7`
- `valor-homepage.png`: `afd6eec8838a6dab`
- `valor-interior.png`: `75af63d340d6b3e7`
- `ridgeview-homepage.png`: `d20befaf2753565c`
- `ridgeview-interior.png`: `e55eaced4b5d61ba`
- `harborlight-homepage.png`: `0c90799c48629bc8`
- `harborlight-interior.png`: `e14e2039533517e3`

## The three identities must share one implementation
| Reference | Brand tokens | Homepage model | Detail-page model |
| --- | --- | --- | --- |
| Valor Academy | Heritage navy, gold, ivory; editorial serif | Hero with coherent student photography, strong display headline, two contextual actions, four values | Academics: image-led overview, approved Program listings, level/program navigation and curriculum detail only when verified |
| Ridgeview Christian School | Forest green, sage, cream | Human-scale community photo, warm welcome, four values | Student Life: consented imagery, approved activities and clubs; never imply a planned activity is operating |
| Harborlight Academy | Harbor burgundy, muted rose, ivory | Heritage/coastal photo treatment, distinctive admissions storytelling | Admissions: next-step navigation, institution-reviewed process, fees/aid only when approved, available inquiry or authorized Apply |

The existing `site-theme.ts` curated `heritage`, `forest`, and new `harbor` palettes are reusable choices, **not** hardcoded by school name. The same renderer must handle each Site with approved branding. Brand choice from a church's URL/socials is **suggested and reviewed**, never automatically imported as arbitrary CSS, fonts, scripts or unlicensed images.

## Required reusable page library and information mapping
All displayed records must pass existing privacy, applicability, publication and legal/admissions gates; a saved draft is never public merely because it exists.

| Page/section | Canonical owner | Behavior when data not approved |
| --- | --- | --- |
| Home: story, values, hero | Published `site_local_content_versions` and approved branding | Quality-designed, truthful limited-content layout; avoid empty cards and invented staff/photos |
| About / faith / community / mission | Reviewed church Site editor | Omit missing claims, preserve genuine authored voice |
| Academics and grade bands | Published academic Program marketing by Site/Program/year | Hide unpublished Programs and unsupported curriculum claims |
| School Day | C-approved per-Program/year weekly timetable | Explicitly unconfirmed; Sunday and variable-day schedules supported |
| Student life / activities | Existing published enrichment/season catalog | Clearly distinguish illustrative, planned and bookable content |
| Leadership / teacher introductions | A's consent- and revision-checked public people projection | No names, photos or roles from private staffing records |
| Family Services | Independently reviewed meals/transport/extended care/communication/visits/safety summaries | Don't imply service is offered or physically operating |
| Admissions | Canonical published Program and D family-start eligibility | Interest, inquiry, waitlist and Apply must remain distinct; no unapproved admissions CTA |
| Tuition / Aid | Finance-owned approved institutional statement | Withhold fees, aid amounts and funding eligibility until approved |
| Facilities / campus | Independently authorized public Site identity, reviewed assets and occupancy claims | No inferred capacity, location, inspections or visit availability |
| FAQ, Contact, Parent Resources | Approved public facts and explicit institution-controlled contact | Don't render a dead-end CTA; display a truthful next-step state |

### Onboarding-to-site traceability
For each website fact trace **one-hour setup input → canonical persisted owner → public display approval → server projection → page/section → local preview → tenant-host published view**. Create no parallel school website database or ad-hoc Valor renderer. Any preview suggestion must be explicitly labeled unapproved and must never be mistaken for published content.

## Screenshot and interaction acceptance — all five scenarios
Reference fixtures:
1. Valor / heritage / secondary hybrid / Home + Academics.
2. Ridgeview / forest / elementary / Home + Student Life.
3. Harborlight / harbor / admissions-focused / Home + Admissions.
4. A minimal-content school: graceful limited-content hierarchy, no fabricated facts.
5. Multi-Program school with disparate schedules including Sunday/weekend enrichment.

For each available page capture **1440, 768, 375, 320 CSS px** screenshots. Compare hero/image framing, header, serif hierarchy, palette contrast, whitespace, logo quality, content density, section sequencing, cards/tabs, calls to action, responsive behavior and footer. Capture mobile menu open and closed. Manually compare with source pack; a CSS or unit test alone does not verify visual parity.

Click and verify each present header/footer/CTA link in the public site and local-only preview, including back navigation. No link may escape a synthetic local preview into an authenticated CAN OS route. Check 404 for unsupported tenant routes, no cross-tenant leakage, consent-gated local inquiry forms and their canonical POST handling on the attested development branch, no scripts/private admin assets at tenant origins, and correct canonical, robots, sitemap and noindex for synthetic Sites. The production-build preview remains read-only.

For live-form-eligible fixtures exercise valid and invalid consent, idempotent repeat submissions, forged Site/Program IDs, publisher revocation and admission closure against a disposable isolated DB. Never fabricate independent licensure, opening, child consent or tuition approval to make the screenshots look green.

## Review log
Record one row for each defect: `School | Page | Viewport | Integration commit | Screenshot path/hash | Expected comp | Actual difference | Reproduction | Owning workstream | Severity | Disposition`.

Exit requires: all five fixtures rendered by one shared component and source projection, appropriate public facts present, no broken links, 320px no horizontal overflow, reviewable photography provenance, human-confirmed visual comparison, passing exact-head CI/FullFlow and isolated Neon + browser flows. A passing integration PR without the visual evidence is **not yet design-accepted**.

### Immediate known gaps
The current server-rendered pages remain considerably more text-heavy than the supplied comps. Actual published sites cannot embed screenshot photography as if it were rights-cleared local content. The existing Site editor has only one bounded hero-image field and no fully supported compositional media library/approved-logo pipeline; that needs a governed product implementation with rights and accessible alt text, not a hardcoded CSS background. Also complete onboarding-to-website projections for campus/facilities, leadership, finance/disclosures and family services before declaring the full school-site experience finished.
