# CAN school website — Integration and release evidence (2026-11-03)

**Owner:** integration. **Target:** `bryanhkelly/can-os/main`. **Decision:** **NO-GO for public production launch.** This is a source-integration checkpoint, not a certification of live site operation or legal permission to open a school.

## Contract and source provenance

Use the updated `06-INTEGRATION-RELEASE-ACCEPTANCE-UPDATED.md` and supplemental `08-PATCH-EXECUTION-ORDER.md`: A owns parent-safe contracts; B owns website/editor/rendering; C owns schedules/activities/jurisdiction; D owns guardian/admissions; P owns optional, site-scoped church source discovery. Existing canonical `Organization → Site → Program` and institutional approval are authoritative. Public hosting, deployment, migration and DNS/TLS require separate authorization.

Church source handoff: `docs/church-source-discovery-status.md`; visual B handoff: `docs/PX-B-VISUAL-DESIGN-BRAND-HANDOFF.md`. Workstream P introduced additive migrations `0067` and `0068`, with production application **not authorized**. Church website retrieval is default-off at `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED`; tenant public-host routing is separately default-off at `CAN_PUBLIC_SITE_HOSTING_ENABLED`.

## Source integration fixes committed to main

| Issue | Exact commit | Change |
| --- | --- | --- |
| Storybook fixture lacked newly required Site address | `403d9c8d492b817ceac15324247ac69348b58a60` | Added explicit null address in synthetic Site |
| Calendar session `endsAt` is nullable | `fb725fd8187a947c4dbd6d41c7a81677aa824ce9` | Exclude null-ended sessions from public bookability logic |
| Launch options returned unserializable Site JSONB | `1c052f6c79f2f525b108320c5fa98f905b7a2992` | Transform Site address through existing `safeJsonObject` before TanStack boundary |
| Teacher next-action indexed possibly empty queue | `5beadc78e0de6708b92c867888ccb980c35274d7` | Narrow indexed entry in guarded nonempty branch |

The baseline CI at `ab30effbfe5295277b013bddcfad9b492ba01993`, [run 41670982979](https://github.com/bryanhkelly/can-os/actions/runs/41670982979), **failed** with those four source-file error groups. Re-run CI against the final source SHA and record its actual outcome; individual commits do not establish a passing gate.

## Historical, explicitly bounded evidence

- Workstream P, [run 41670624291](https://github.com/bryanhkelly/can-os/actions/runs/41670624291), reported build, focused church URL/egress tests and Drizzle review successful, but whole-repository TypeScript failed. No real church source ingestion or isolated Neon fixture acceptance was evidenced.
- Workstream B, [visual run 41665968060](https://github.com/bryanhkelly/can-os/actions/runs/41665968060), reported 35 synthetic screenshot captures, no overflow or scripts. These are earlier SHA captures, not proof of latest source or pixel fidelity to supplied comps.
- [Admissions Neon run 41670982946](https://github.com/bryanhkelly/can-os/actions/runs/41670982946) failed the prerequisite check for an isolated test database secret. **Do not use a production connection string as a substitute**.

## Release acceptance matrix (pending unless an exact execution result is attached)

| ID | Scenario / release assertion | Status | Required evidence |
| --- | --- | --- | --- |
| I-01 | First church → canonical Site and Program → one-hour draft preview, no website sources | UNVERIFIED | Authenticated browser captures on isolated fixture and audit rows |
| I-02 | Existing Site reuses same draft website with first/new Program | UNVERIFIED | Site/Program cardinality and UI screenshots |
| I-03 | Two Sites have independently scoped hosts/editors and reject cross-tenant reads/writes | UNVERIFIED | Negative browser/HTTP/DB assertions |
| I-04 | Planned school remains marketing-only; Apply closed | UNVERIFIED | Canonical status and CTA screenshots |
| I-05 | Authorized academic school serves verified grades/schedule/tuition/links | UNVERIFIED | Source-to-DTO trace and screenshots |
| I-06 | Sunday/weekend and grade-specific schedule; unstaffed activities hidden | UNVERIFIED | Calendar/approval fixtures and public render |
| I-07 | Agreement, timetable, admissions or jurisdiction evidence revoked | UNVERIFIED | Stale-claim removal and CTA suppression |
| I-08 | Consented inquiry captured and routed, tour interest unconfirmed | UNVERIFIED | Form/browser, scoped Action/interest rows |
| I-09 | Guardian verify → one Application → offer → enrollment for SAME Program | BLOCKED | Isolated Neon secret + distinct-role browser evidence |
| I-10 | Host/Origin, POST method, private paths, sibling identity and replay denied | UNVERIFIED | Real edge tests + browser/network evidence |
| I-11 | Church URL → bounded fetch → per-field review → versioned copy → preview/publication | UNVERIFIED | Default-off safe egress acceptance + provenance |
| I-12 | YouTube/social unsupported content remains reference-only | UNVERIFIED | Honest fallback screenshots |
| I-13 | Church sport mention never asserts school activity | UNVERIFIED | Canonical source/availability trace |
| I-14 | SSRF, prompt injection, stale suggestion and cross-Site attacks denied | UNVERIFIED | Direct security fixtures |
| I-15 | Missing/unreachable sources do not block draft preview | UNVERIFIED | Authenticated browser acceptance |
| I-16 | Image/child consent prevents unlicensed auto-import | UNVERIFIED | Rights and negative source tests |
| I-17 | Visual fidelity at 1440/768/375/320 across 3 schools | PARTIAL / EARLIER SHA | Latest screenshots **and actual comp references** |
| I-18 | Full typecheck, lint, build, route inventory, Drizzle diff and relevant suite | PENDING RERUN | CI job logs tied to exact main SHA |
| I-19 | Isolated Neon `0067/0068` migration, CRUD, rollback and audit | BLOCKED / NOT RUN | Disposable branch and migration ledger checks |
| I-20 | Public custom host DNS/TLS, edge, security headers, index/canonicals | NOT AUTHORIZED | Explicit launch authority and real host verification |

## Required release sequence

1. Stabilize main and obtain **successful** CI/build/typecheck/migration-diff evidence at one SHA; retain actual logs.
2. Provide isolated Neon acceptance credentials to secure CI (not production credentials) and execute the 16 source-to-parent scenarios with fixture isolation.
3. Run newest visual screenshot workflow across all three schools; compare against actual approved comps and remedy material deltas.
4. Validate host allowlists, tenant isolation, TLS/CSP, consent, source rights, refresh/SSRF and revocation; verify source DTO exposure through network responses.
5. Obtain independent institutional/legal review and explicit production migration/hosting/rollout authorization. Until then keep both feature switches off and do not mutate production.

**Current release decision: code integration underway; production rollout not authorized.**
