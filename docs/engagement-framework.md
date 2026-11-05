# CAN OS Engagement Framework

**Scope:** Same integration branch as Website Studio, `feature/website-studio-design-and-settings` (PR #270).  
**Status:** Implemented code, awaiting comprehensive integration and browser acceptance. No migration, video player, CMS or production rollout.

## Core design

**Landing → Launch Studio → Next Steps** is one coherent interface family, but the middle is the existing, authoritative Launch Studio. There is no separate exploration application or parallel workflow engine.

| Surface | Routing | Ownership |
| --- | --- | --- |
| Public landing selector | `/landing` | Finite CAN audience registry |
| Public audience landing | `/landing/:journeyId` | Five curated audience entries |
| Existing verified experience | `/launch/school`, `/launch/family`, `/launch/staff` | Existing identity, Site/Program, admissions and qualifications services |
| Existing school website editor | `/launch/website` | Verified Site editor and canonical versioned website content |
| Public follow-up choices | `/next/:journeyId` | Read-only choice guidance; no operational completion claim |
| Existing long-term editor | `/settings` | Canonical authorized revisions |
| Public CAN conversation | `https://can-academy.netlify.app/contact` | Existing marketing form, not a CAN OS data mutation |

The intended canonical code lives in:
- `src/domain/engagement-journeys.ts`: five campaign families and finite actions, optional `guidance` video keys only.
- `src/domain/engagement-context.ts`: bounded marketing context and role-gated link destinations.
- `src/components/engagement/*`: reusable public landing, response, chrome.
- `src/routes/landing.*`, `src/routes/next.$journeyId.tsx`: public route entry points.
- Existing Launch Studio entry and three relevant `next` stages link into the same public follow-up choices **without altering their stage model or canonical status actions**.

## Verified launch, not an open funnel into protected data

- Public visitors may read all landing and Next Steps pages without authentication. There are no public impersonation tools and no school/student/staff records in these routes.
- Current verified users see a direct link to the existing launch route only for their compatible role; server authorization still independently enforces scope and relationships.
- For schools, existing `/schools/new` is offered as an **explicitly isolated .demo setup**, never presented as an operating partner school or a real public enrollment.
- The staff landing is **recruitment interest**, not an unverified teacher application or job offer.
- Family landing is **program discovery**, not a school-specific application; guardians must enter through their verified invitation or authorized family records.
- The existing Launch Studio `next` stages remain the authoritative guidance for readiness, qualifications, applications and offers. The public `/next/:journeyId` screens are optional conversation paths, not a submission receipt.
- The curated audience choices only link to published marketing information or the existing public CAN contact form. Feedback currently uses that contact form, which requires contact information. **Do not claim anonymous feedback is supported.**
- Marketing tags are bounded to `campaign`, `utm_source`, and an allowlisted `partner`. Never derive trusted tenant, student, verification or school data from campaign parameters.
- All current CDN/asset references are owned by CAN OS; no remote school imagery is scraped or copied.

## Why video does not require a new admin console yet

The registry optionally declares `guidance.landing`, `guidance.experience` and `guidance.next` string identifiers. Nothing reads or plays them.

No upload, publishing, content association UI, DRM, social/video scraping, caption pipeline, view tracking, or arbitrary remote URL handling is implemented. A future small, curated asset manifest can resolve approved video IDs without blocking the existing flows. Adding video requires separate approval for real presenter, script, transcript, captions, media rights and optional playback.

## Reconciliation of two repositories

The earlier exploration implementation in `bryanhkelly/can-website` PR #4 is a **parallel prototype** and must not be merged alongside this unified implementation. This CAN OS branch is the canonical owner of the new engagement routes. The public marketing site's v12 story and v14 audience doorways remain unchanged; future campaign CTAs can link to the integrated CAN OS Landing routes after host approval.

There is no cross-repository Git branch; this unified PR provides the combined application and release acceptance target. It does not automatically deploy marketing-site changes.

## Release acceptance

- Run CAN OS CI (build/TypeScript, lint, route contracts, fixture coverage, unit tests).
- Test signed-out `/landing`, all five named landing pages, and `/next/start-a-school` as public pages, without leaked data or CAN OS workspace navigation.
- Test current registrar/site admin vs unauthenticated vs guardian/staff on the School Landing. Cross-role links must not grant access.
- Test the optional .demo creation from school landing with verified public demo-only restrictions. Never create a production school via public exploration.
- Open `/launch/school` as the verified Site and visit Next. Verify it continues to show readiness from canonical records, with optional public partnership follow-up.
- Continue from a verified family application Next without asserting admission, and staff Next without asserting clearance.
- Verify external marketing contact links, intent and campaign context, privacy, keyboard access, responsive layouts and accessibility.
- Actual analytics, production lead routing, saved anonymous sessions and any recruiting/application CRM integration are deferred. Do not report operational conversions based on public clicks.
- Video slots should have no player or upload controls and never appear as broken placeholders.

**This is a cohesive branch for implementation review, not a release certificate.**
