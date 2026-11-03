# Agent C — Operations, activities, school day, services, jurisdiction

Date: 2026-11-03  
Repository: `bryanhkelly/can-os`, branch: `main`  
**Status: C-owned implementation handed off; integration and acceptance NOT complete.**

## Implemented and committed

### C1–C3: Canonical activities and registration
- Extended existing noncredit Activity draft categories with STEM, faith, leadership, and outings. The current Launch wizard already mounts `ExtendedLearningSeasonPlanner`; selected offerings create existing Activity/Season draft records, not website-only state.
- Removed Monday–Friday as the default selected recurrence pattern in the planning form; all seven weekdays remain available.
- Existing season publishing/registration/safeguarding review authority is preserved. The enrichment catalog now excludes ended/cancelled dated sessions from bookable capacity and disables registration when full, outside the registration window, or with no future sessions.
- `src/domain/activity-presentation.ts` maps canonical types and provides `projectPublishedEnrichmentActivity` for A's public DTO, without establishing any new publication authority.

### C4: School-day read, approval, invalidation
- `src/domain/public-school-day.ts` projects reviewed active school-year schedule template periods. Supports Sunday/Saturday and site-local time, with no fabricated Monday–Friday default.
- `src/modules/academic-time/public-school-day.server.ts`: scoped Program/Site academic schedule reader. Requires explicitly reviewed current schedule signature and active school year. Returns pending on missing, stale, conflicting or mixed-day hours rather than publishing invented uniform hours.
- `src/modules/academic-time/public-school-day-approval.server.ts` and `.functions.ts`: institutional Site publisher reviews the actual saved schedule; exact period signature automatically withdraws outdated approval after edits. No staff/student or room data in public projection.
- `src/components/operations/PublicSchoolDayReviewPanel.tsx`: bounded review UI. It must be mounted by integration owner in an appropriate publisher workspace (do not grant church editor rights).
- A's existing `PublicSchoolDay` has one start/end pair. Grade variants and different times on different weekdays require an A/B DTO/template extension; until then these are held pending instead of flattened incorrectly.

### C5: Family services and people
- `src/domain/site-family-services.ts`, `src/modules/sites/site-family-services.server.ts` and `.functions.ts`: Site-owned revisioned service records in canonical Site metadata, explicit `not_offered/planned/confirmed/available`, evidence references, expiry, institutional publisher authority and audit.
- `src/components/operations/FamilyServicesSetupPanel.tsx`: bounded setup/review UI; mount in an authorized publisher workspace. Planned services are described as not yet available; verified not-offered services are explicit.
- `src/domain/public-site-people.ts`, `site-public-people-consent.server.ts`, `site-public-people.server.ts`, `site-public-people.functions.ts`: staff-authored public display name/title/biography consent, expiry, immediate withdrawal, institution approval of exact signature, live active Site staff relationship checks; restricted safe public identity subset. Does not expose person IDs, profile photos, contact info, employment records, safeguarding/credential evidence, students or guardians.
- `MySiteBioConsentPanel.tsx` and `SitePublicPeopleReviewPanel.tsx`: person-owned opt-in and publisher approval. Mount in authenticated appropriate role workspaces.
- Public profile images remain withheld. Existing church website artwork rights/child-consent checks should be retained; any staff portraits require separate real licensing and consent gate before implementation.

### C6–C7: Reviewed jurisdiction applicability and canonical review Actions
- `src/domain/jurisdiction-profile.ts`: optional effective-dated requirement applicability, category and disclosure audience on existing versioned jurisdiction profile schema. Legacy requirement fields remain parseable but lack of scope cannot imply statewide applicability.
- `src/routes/operations.jurisdiction-profiles.tsx`: reviewed requirement scope and audience editing within existing CAN reviewer workspace.
- `src/domain/jurisdiction-applicability.ts`: conservative applicability against current Site/Program model, no definitive claim when scope, effective review, official evidence, or school attributes are unresolved.
- `src/modules/programs/school-jurisdiction-review.server.ts` and `.functions.ts`: authenticated registrar reader of latest published independently reviewed profile; checks current source snapshots and original reviewer decision. Candidate public disclosures are NEVER an actual published public legal assertion without Agent A's separate institutional gate.
- `src/modules/programs/school-jurisdiction-actions.server.ts`: idempotent existing Action for CAN legal review, refreshes/reopens on changed profile versions; does not create a second compliance task database or approve opening.

### Safe typed Agent C → Agent A integration boundary
`src/modules/sites/site-operations-public.server.ts` exports:
`readPublishedSiteOperationFragments(siteId: string, programId: string)`

Returns `null` unless the exact Site publication is current, and only an approved Site/Program-safe subset:
- `activities: PublicActivitySummary[]` from canonical approved enrichment catalog
- `schoolDay: PublicSchoolDayProjection` only when Program marketing snapshot and academic services are current, else pending
- `services: PublicSchoolService[]` from approved Site metadata, with explicit availability wording
- `people: PublicSitePerson[]` from exact, revocable self consent and institutional approval

The adapter holds a shared Site-publication lock in one transaction. **Do not create a second website endpoint or bypass A's institutional claims, host routing, or D's admissions gates.**

## Added unit test source (not yet executed)
- `tests/unit/activity-presentation.test.ts`
- `tests/unit/public-school-day.test.ts`
- `tests/unit/site-family-services.test.ts`
- `tests/unit/public-site-people.test.ts`
- `tests/unit/jurisdiction-applicability.test.ts`

## Validation and remaining integration responsibilities
- GitHub connector commits succeeded. **No repository typecheck, lint, Vitest, build, database tests, or browser acceptance could be executed in this session.** No production migrations or deployments were run. This is not production acceptance.
- Integration owner: mount the three publisher review panels and staff self-consent interface in role-appropriate authenticated pages; never expose those server functions on public tenant hosts.
- Integration owner / Agent A: merge `readPublishedSiteOperationFragments` into the approved parent-information read inside the existing public catalog transaction (avoid redundant nested transactions). If the integration owner needs its own transaction, refactor adapter to accept its executor rather than nesting. Preserve revocation agreement and cross-tenant checks.
- Integration owner / Agent B: render activities, services, school day and people only from approved typed claims; show pending where not verified. Extend school-day DTO for separate daily/grade variants before displaying mixed patterns. No private calendar/roster/location.
- Integration owner / Agent D: retain distinct guardian admission, enrichment registration, consent, fees and capacity gate. Never interpret a website Activity summary as registration permission.
- CAN legal reviewer and integration owner: connect `requestSchoolJurisdictionLegalReview` in launch flow, complete policy-specific review, and create independently approved legal/public disclosures via A's allowed DTO only; never publish raw jurisdiction candidates.
- Acceptance: run tsc/lint/build/affected unit suites, isolated disposable Neon integration (not production), browser flows for registrar/publisher/staff/guardian/anonymous roles, cross-Site denial, revocation, full and expired sessions, mixed Sunday schedules, stale state law and consent withdrawal. Fix failures before deployment.

## Selected commit references
- Existing C1/C3: `82c84a8`, `389804d`, `b8644e5`, `38f00d2`
- Jurisdiction: `964f6fd`, `0c97b75`, `a7e72a5`, `d8ddb80`, `4a6caa9`, `cb31ae6`
- School day: `a62b536`, `66d17e5`, `a100a93`, `2abe9c4`, `1af7671`
- Services: `4f9ce35`, `dced229`, `e20542e`, `6a0d7ae`
- Public staff consent: `d5e00ea`, `b2ad6b6`, `4a10c16`, `f21e0ed`, `f9b9b1e`
- Operation adapter: `bdd3d8a`, `8b75c98`

**Agent C is handing off code and explicit release blockers, not asserting complete end-to-end acceptance.**
