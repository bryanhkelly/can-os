# CAN School Sites — Valor onboarding-to-public acceptance ledger

Updated: 2026-11-03. **Not an acceptance certificate.** Based on Integration PR #264 code and the last recorded read-only Valor database inspection in `docs/valor-reference-school-baseline-2026-11-03.md`. Recheck actual current tenant state before changing published records. No production Neon writes have been authorized or performed by this patch.

## Completion standard

Every Site/Program onboarding datum that parents need must have:

`Onboarding input → canonical record → independent publication authorization (where required) → approved public projection → actual page or section → private preview → published tenant URL → browser assertion`.

These steps are deliberately separate. Do not make confidential enrollment, teacher qualification, legal documents, private contact data, speculative fees or simulated school-opening status public to achieve apparent page completeness. No second Site, CMS, enrollment CRM, academic Program or school-opening approval store.

## Source-backed, current implementation map

| Parent category | Canonical source / existing feature | Page(s) | Current integration status | Remaining gate |
|---|---|---|---|---|
| School identity | `sites`, `organizations`, `site_publications` | Header, home, footer | Displayed | Check public name/host and live reachability |
| Mission, story, faith and traditions | `site_local_content_versions`, normal church editor | Home, About | Rendering exists; no saved Valor version at last inspection | Authorized church editor publish, source/copyright and visual review |
| Academic programs, grades and delivery modes | `program_publications`/canonical Program catalog | Home, Academics, School Day, Admissions | Rendered; richer per-Program delivery section now committed | Review source-current publication and multiple Program case |
| School-day timetable (including Sunday) | Academic calendar + independent C approval | School Day, FAQ summary | Program-scoped renderer exists | Verify authentic approved calendar for each Valor Program; never synthesize weekdays |
| Enrichment and student activities | Published Season/activities projection | Student Life, Home | Published offerings visible; clearly fictional demo examples can appear in synthetic preview | No invented registration or operational event |
| Church and campus imagery | Church approved hero/rights record | Home and interior pages | Rights-gated hero exists; 24 original CAN abstract fallback illustrations now implemented | Folder ingest/rights review, approval and production R2 photo media library not done |
| Public leadership / people | Person self-consent + Site independent approval reader | About | **Now rendered from approved DTO only** | Valor consent, review and live browser check; no private roster inference |
| Site/family services | Current Site family services review metadata | Families | Approved category descriptions rendered | Actual Site review/expiry and readable family guidance |
| Tuition and fees | Finance source, independent institutional review | Tuition, Admissions | **Not complete**: DTO supports claims; authoritative publisher/read adapter not fully implemented | Finance-owned versioned approvals, withdrawal, scoped public pricing evidence |
| Financial aid | Finance / verified funding facts | Tuition | **Not complete** | No guarantee or inferred eligibility; finance approval pipeline |
| Public address/contact | Site physical address/private setup contact + independent publication approval | Contact, footer | Independent writer exists on integration branch, rendering gated | Validate Valor exact reviewed facts, consent, expiry, withdrawal and current Site revision |
| Legal, licensure, accreditation disclosures | Reviewed jurisdiction/legal evidence | Admissions and applicable pages | Claim DTO and disclosure section exist, but authoritative public disclosure pipeline incomplete | Compliance reviewer/version/expiry/withdrawal and required audience gating |
| Admissions and inquiry | Canonical Program marketing + actual family-start/seat gates | Admissions, Contact | Verified per-Program Apply and inquiry are gated separately | Persisted anonymous intake, email/guardian handoff and hosting tests |
| Family portal | Authenticated guardian/household workflow | Families | **Not complete**: public DTO is unconfigured; no safe handoff | Verified authenticated portal destination and non-public data boundary |
| Campus/facilities | Site rooms, planning and inspection records | About / future Campus section | **Not complete**: no independent public-safe facility facts projection | Public scope/rights/safety approval; never infer live campus facilities from internal rooms |
| Parent FAQs | Approved identity, tuition, Program and school-day information | FAQ | Grounded FAQ section implemented; page now available when published academic/tuition facts exist | Broader FAQ policy/source coverage and browser validation |
| Visual design | Shared theme tokens, public HTML and original CAN fallback illustrations | All pages | Shared design and multiple visual families implemented | Photography-led comp parity, 320–1440 responsive screenshot comparisons, contrast/a11y |
| External media folders | User-authorized source reference, staging, provenance and asset grants | Setup and website editor | **Not complete**: deterministic approved-media planner is implemented only | Cloud folder connection/upload, indexing, classification, rights review, R2 production service, actual placement integration |

## Valor-specific state

Previous read-only inspection found `valorschool` public slug and one published synthetic 9–12 high-school marketing Program; no `site_local_content_versions` rows; no assigned `site_website_editor`. Other synthetic Programs were unpublished. **Do not silently publish a fictional church story or create privileged role assignments via direct SQL.** Use normal synthetic editor onboarding and approved local-content command. This document does not assert those observations are still current.

## Release-blocking gates

1. Exact integration SHA passes build, typecheck, unit, FullFlow and church-source static checks.
2. Isolated Neon acceptance runs with a disposable database and current migrations; the environment currently fails the isolated-secret prerequisite.
3. Authorized synthetic editor publishes fixture content through canonical command; every public page is verified in rendered browser against approved comps.
4. Onboarding-to-public matrix passes for a new church with complete content, a second with minimal content, and a third with multiple Programs and Sunday hours.
5. Confirm public approval withdrawal immediately hides relevant facts, changed Site/Program/schedule revisions invalidate outdated claims, and public host/tenant route isolation holds.
6. Finance and legal public claims are never manufactured in the demo. Missing owner-approved data must produce honest requests or withheld pages—not empty fiction or illegal assertions.
7. Media fallback must not be described as actual campus/student photography. New school uploads must never be published solely because a folder was connected.

**Do not mark all onboarding-to-website content complete yet.**
