# CAN OS convergence — code-based source map
_Audited against `main` on 2026-11-03. Integration I owns this map. Recheck main before applying contracts; this is a coordination map, not a substitute for source inspection._

## Mission and invariants
One church → one persisted Site configuration → independently approved Program claims → one public school website → one family journey → same Site's operations. Do not create a second school model, state machine, publishing renderer, intake table, or operations dashboard.

Canonical scope identifiers: `organizations.id` (`organizationId`), `sites.id` (`siteId`), `programs.id` (`programId`), `schoolYears.id` (`schoolYearId`), `jurisdictions.id` (`jurisdictionId`). `programs.siteId` may be nullable in schema; a selected Site must never be inferred merely from a Program slug. Program affiliation and authority must be checked server-side. URL/search parameters select candidates only: `resolveOperationsSelection` applies actor scope and verifies requested Site and Program. Do not silently switch to another Program.

## Owners and existing integration points
| Agent | Owned concern | Canonical sources / entry points | Boundary |
|---|---|---|---|
| I | shared schema and API decisions, migrations, cross-owner files, contracts, release verification | `src/db/schema/*`, integration docs, cross-owner call sites | Sole arbiter of conflicting migrations and shared changes |
| S | Site creation, authoritative address and contact capture, configuration persistence | `src/components/operations/LaunchWizardPage.tsx`; `src/modules/programs/launch.functions.ts`; `src/db/schema/organizations.ts` | Must not publish a claim or invent new Site/Program stores |
| C | jurisdiction applicability, school-day approvals, operating readiness | `src/modules/programs/jurisdiction-profile.functions.ts`; `src/modules/academic-time/public-school-day.server.ts`; `src/modules/operations/school-opening.server.ts` | Research never equals legal authorization; preserve Sunday/weekend schedules |
| P | external church references, extraction, brand suggestion provenance | `ChurchSourceReferenceEditor.tsx`; `ChurchSourceSuggestionReview.tsx`; `church-public-web-fetch.server.ts` | Suggestions require editorial selection; external styles/assets never auto-publish |
| A | reviewed anonymous-safe parent claims, public DTO, field-level provenance | `src/domain/parent-information.ts`; `src/modules/sites/site-public-catalog.server.ts`; `src/modules/sites/public-parent-extras.server.ts` | Only confirmed source records and approvals; no independent CMS |
| B | public site design, `/site-website` editor, publication UX, routes | `src/domain/public-site-html.ts`; `src/domain/public-site-paths.ts`; `src/routes/published-site*.tsx`; `src/routes/site-website.tsx` | Consume A's approved DTO; don't bypass server renderer / publication gates |
| D | consented interest, invite, verified-family application and enrollment transitions | `src/modules/enrollment/public-admissions-interest.server.ts`; `public-family-start.server.ts`; `family-invitations.server.ts`; guardian/admissions routes | Reuse existing records and eligibility checks; no new lead/enrollment pipeline |

## Field-to-record contract (initial; gaps explicitly unresolved)
| Field or fact | Canonical record / reader | Mutator / validator owner | Public use and next action |
|---|---|---|---|
| School organization, legal name | `organizations.name`, `organizations.legalName` | existing org management / I on shared migration | A projects only reviewed institutionally safe facts; don't substitute display name for legal entity |
| Church host | `programs.hostOrganizationId` | S + existing launch/provider validator | B must distinguish host supervision from CAN academic responsibilities |
| Site identity | `sites.id,organizationId,name,slug,timezone` | S via `createLaunchSite` | A may project school name only behind site-publication gate |
| School physical address | `sites.address` JSONB exists; creation UI does not submit it | S defines typed validation and mutation, I approves schema changes | A accepts only separately reviewed public-safe address; geocoding/timezone cannot establish jurisdiction |
| School contact | No approved public-contact projection currently in `projectApprovedParentInformation` | S proposes canonical, revisioned source and server validation; A owns safe projection | Currently `unconfiguredClaim("organization_site")`; no synthetic phone/email |
| Program, grades, delivery, provider, credits | `programs` + `programPublications` | existing program launch + institutional publishing | A uses `readAcademicProgramCatalog`; B renders approved programs only |
| Jurisdiction | `programs.jurisdictionId`, `jurisdictions`, published `jurisdictionProfileVersions` | C: applicability / independent reviewer | Draft research and review evidence cannot display as law or opening approval |
| School year | `schoolYears` | C / existing school-year workflow | Always associate timetable / admissions eligibility with correct Program and year |
| Days and hours | `scheduleTemplates`, `scheduleTemplatePeriods` via `readApprovedPublicSchoolDay` | C controls academic-time approvals | A must add approved per-Program claim collection; current site-wide schoolDay withheld for multiple published Programs |
| Church story, faith, branding | revisioned Site local content via `readCurrentLocalContent` | B editor; P source suggestions | Reviewed local copy is distinct from regulated academic/institutional statements |
| Leadership and bios | Not yet mapped to a reviewed public person/bio record | S/A propose consent, source and approval | Do not expose staff/student identity or invent biographies |
| Tuition, financial aid | Currently unconfigured in `parent-information.ts` | Finance/institutional owner, A adapter | No numbers, funding eligibility or aid guarantees until independently reviewed |
| Family services | `sites.metadata` through `projectPublicFamilyServices` | S/C verify owner and revision | A consumes reviewed descriptions; no automatic claims |
| Disclosures/licensure/accreditation | `school-opening.server.ts` and independent jurisdiction decisions; public claims unconfigured | C + institutional reviewer + A projection | Source-specific, effective-dated disclosures; publication ≠ permission to operate |
| Admissions availability | `public-family-start.server.ts` verified destination and program/application gating | D owns eligible transition | Interest before opening is not an application; Program marketing approval is insufficient |
| Interest / invitation | `publicAdmissionsInterests` / invitation services | D | Consent + throttling; do not create duplicate lead store |
| Family portal | currently unconfigured public profile; existing guardian/admissions routes | D defines safe destination | Never invent URL or treat enrollment as completed identity verification |
| Public Site publication | `sitePublications`, `site-publication.server.ts` | institutional publisher | B may say published only when authority says so; external DNS/TLS separately verified |
| Program marketing | `programPublications`, `academic-program-publication.server.ts` | institutional publisher | Does not open admissions or activate school |
| School opening | `school-opening.server.ts`; launch handoff `program-launch-service.ts` | independent church/CAN authorities | Operate only after appropriate independent decision and named handoff |

## Existing projections and known constraints
- `src/domain/parent-information.ts` defines `PublicClaim<T>` with `value,source,revision,audience,status,canDisplay`. A claim is displayable only if public, approved and source-attributed. The projection currently leaves address/contact, tuition/aid, admissions copy, disclosure and family portal unconfigured.
- `site-public-catalog.server.ts` holds a Site-publication shared lock, reads published offerings, academic catalogs and local content, then calls `projectApprovedParentInformation`. Keep published anonymous reads behind the same publication gate.
- `public-parent-extras.server.ts` correctly withholds a Site-level day when multiple academic Programs publish. A must model per-Program schedules keyed by `programId`, with provenance; no site-wide inference or automatic Monday–Friday exclusion. Day index 0 is Sunday.
- `public-site-html.ts` renders escaped server HTML and routes only to available approved sections. `/site-website` is a private editor/preview, not permission to activate a hostname.
- `operations-scope.server.ts` validates Site and Program selection against server-side authorization; launch handoff uses existing Site operations rather than a duplicate dashboard.

## Integration-owned interface requests (not yet merged)
1. **S → A:** typed, validated Site physical address/contact read contract (nullable, provenance, review metadata) plus migration only if current records cannot satisfy it. Handle existing Site creation, retries, drafts and multi-campus operations.
2. **C → A:** `ApprovedProgramSchoolDay[]` keyed by `programId`, `schoolYearId` and timezone; identify schedule effective dates, individual days including Sunday and approval/revision; no student timetable leakage.
3. **A → B:** one typed public parent profile from server-approved facts. B must render without parsing raw Site metadata for public claims.
4. **D → B:** independently authorized `interest` vs `apply` CTAs and action destinations per Program; capture consent and preserve re-entry context.
5. **P → B:** bounded suggestion DTO with origin URL, retrieval time, candidate text/colors/fonts/media, licensing/rights and editorial approval state; no scraped CSS or external asset publication by default.
6. **I → all:** stable Site/Program/year selection; preserve exact Program when moving among launch, website and operations.

## Readiness authority (do not collapse to one status)
`draft_preview` (editor view); `configured` (persisted source); `evidence_submitted`; jurisdiction `research_draft|in_review|verified_published`; `journey_ready`; `institutional_approved`; `site_published`; `host_reachable` (DNS/TLS independently checked); `application_open`; `program_active`; `onsite_day_safe`. These are descriptive aggregation labels, **not** a new persisted enum or entitlement. Only each owning service may attest its state.

## Files reserved / collision protocol
I reserves `src/db/schema/*`, generated DB migrations, `docs/implementation/CODE_BASED_SOURCE_MAP.md` and `docs/implementation/CONTRACT_CHANGELOG.md` for conflicts. A owns parent DTO and catalog adapters; B owns public HTML/routes/editor; D owns enrollment actions; C owns opening/jurisdiction/schedule; P owns church source extraction; S owns launch creation. Cross-owner proposal must include file path, type signature, reader list, authorization, migration/audit plan, backward compatibility and affected tests. Freeze collisions; compare both diffs before deliberate merge. Never regenerate another agent's file.

## Acceptance / golden school
Demo school should use one canonical church Site with an elementary Program, secondary/hybrid Program and optional Sunday/weekend enrichment. Verify resumed Site setup after network failure; approved per-Program hours; accurate church/CAN staffing disclosures; founding-interest versus authorized application; approved publication versus reachable host; verified guardian enrollment; independent opening and named operational handoff. Synthetic demo facts must be marked as such. No claim of runtime completion until commands, database state, per-person access, DNS and recovery are actually exercised.
