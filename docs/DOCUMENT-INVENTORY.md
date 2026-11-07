# Documentation Migration Inventory and Audit Log

**Initiated:** 2026-11-07. The classification table below is the **initial historical snapshot**, not every file's present disposition. A non-truncated recursive Git tree was subsequently verified in Phase 11; use the phase log and [canonical documentation home](README.md) for current paths.

## Initial classifications (historical; see subsequent phases)

| Existing file | Classification | Disposition |
| --- | --- | --- |
| `README.md` | Canonical entry | Rewritten for post-FullFlow main |
| `AGENTS.md` | Canonical agent policy | Updated; technical references still transitional |
| `.github/copilot-instructions.md` | Canonical agent entry | Updated |
| `docs/START-HERE.md` | Compatibility entry | Points to new docs home |
| `docs/vision/CAN-VISION.md` | Canonical product intent | New |
| `docs/README.md` | Canonical documentation home | New |
| `docs/DOCUMENTATION-RESET.md` | Active migration control | New |
| `docs/architecture.md` | Technical, mixed with historical implementation | Reconstruct after code verification |
| `docs/domain-model.md` | Technical, mixed with implementation notes | Reconstruct after code verification |
| `docs/golden-flows.md` | Product and quality, mixed with evidence | Split specifications from evidence |
| `docs/CURRENT-STATE.md` | Historical evidence with dated updates | Archive after replacing active status references |
| `docs/full-flow-acceptance-contract.md` | Retired delivery contract | Archived and original removed after reference update |
| `docs/full-flow-progress.md` | Retired delivery journal | Archive after reference check |
| `docs/integration-convergence-audit.md` | Retired branch execution plan | Exact snapshot copied to archive; original pending reference check |
| `docs/engagement-framework.md` | Historical implementation branch plan | Archived and original removed after reference update |
| `docs/school-launch-studio-site-workspace.md` | Product design mixed with implementation history | Rebuild product spec |
| `docs/website-launch-studio-implementation.md` | Implementation record | Reconcile against current main |
| `docs/school-operations-security-gates.md` | Active safety-sensitive engineering requirements | Preserve in place until verified replacement |
| `docs/neon-development.md` | Active database operational guidance with historical details | Preserve in place until verified replacement |
| `docs/platform-route-contracts.json` | Machine-readable contract | **Do not archive or move without updating scripts/CI** |
| `docs/design-system.md` | Design-system guidance | Preserve until code and Storybook verification |
| `docs/identity-and-demo-access.md` | Security and identity guidance | Preserve until verified replacement |

## Archive copies already created

- `docs/archive/2026-11-fullflow/root-snapshot/README.md`
- `docs/archive/2026-11-fullflow/root-snapshot/AGENTS.md`
- `docs/archive/2026-11-fullflow/root-snapshot/docs/START-HERE.md`
- `docs/archive/2026-11-fullflow/retired-plans/full-flow-acceptance-contract.md`
- `docs/archive/2026-11-fullflow/retired-plans/integration-convergence-audit.md`
- `docs/archive/2026-11-fullflow/retired-plans/engagement-framework.md`

The three retired plan originals were removed after archived blob SHA verification and targeted inbound-reference updates. Root snapshots remain copies only. Other historical documents remain active pending review. The archive copies are historical; new development must not treat them as current authority.

## Dependency checks required before moves

- `scripts/check-platform-route-contracts.mjs` references `docs/platform-route-contracts.json`; retain the contract path or update the script and tests together.
- `.github/copilot-instructions.md` and `AGENTS.md` have been revised to point to the new docs home, but other references in the repository are not yet comprehensively enumerated.
- Existing docs contain cross-links that will need rewriting or preserved redirects if originals are removed.
- FullFlow-named test infrastructure and scripts may still be executable code. Retirement of a delivery initiative is **not** permission to delete test assets without verifying their use.

## Next steps

1. **Completed 2026-11-07:** Obtain a complete recursive Git tree inventory of main (2,510 entries at the phase start; GitHub returned `truncated: false`).
2. Identify all inbound references to each candidate archived document.
3. Archive by coherent batch with atomic reference updates.
4. Promote validated current product and engineering specifications.
5. Run repository link, route-contract, test, and build checks and record results.

## 2026-11-07 migration update

The original `docs/CURRENT-STATE.md` and `docs/full-flow-progress.md` have been retired; historical versions are preserved under `docs/archive/2026-11-fullflow/retired-plans/`. The FullFlow progress archive was made before a final reference-only edit to the original.

Exact snapshots of `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/platform-integration-map.md` are now in `docs/archive/2026-11-fullflow/legacy-specifications/`. Their original paths were subsequently retired in Phase 7 below. Copilot's instructions now point to the canonical replacements.

## 2026-11-07 legacy specification retirement

After byte-identical Git blob verification, the original `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/platform-integration-map.md` were removed. Historical copies remain under `docs/archive/2026-11-fullflow/legacy-specifications/`. Identified inbound links in agent-platform, curriculum, connected-learning, feature-track, admissions, and school-launch documents were updated to canonical documents or exact archived targets. GitHub search is not a complete repository-wide reference audit; automated link checking remains outstanding.

## 2026-11-07 engineering consolidation

Created `docs/engineering/OPERATIONS-AND-SECURITY.md` as the entry point for active runbooks, without moving the underlying Neon, security, identity, R2, route-contract or design-system files. Archived and retired the duplicate `docs/platform-capability-matrix.md` after exact Git blob comparison; its product replacement is `docs/product/PLATFORM-CAPABILITIES.md`. Comprehensive dependency and automated link checks are still outstanding.

## 2026-11-07 dated delivery evidence retirement

Archived and removed `docs/design-system-implementation-plan.md`, `docs/PX-B-EXPERIENCE-PUBLISHING-HANDOFF.md`, `docs/PX-INTEGRATION-RELEASE-EVIDENCE-2026-11-03.md`, and `docs/integration/agent-branch-retirement-pass1.md` into `docs/archive/2026-11-fullflow/delivery-evidence/`, preserving exact Git blobs. Corrected a historical contract reference in `tests/e2e/full-flow-fixture.ts`. The active V6.1 design-system reference and operational/security runbooks were retained. This does not establish passing CI or exhaustive inbound-link coverage.

## 2026-11-07 convergence records

Archived and retired the dated `docs/implementation/CODE_BASED_SOURCE_MAP.md` and `docs/implementation/CONTRACT_CHANGELOG.md` under `docs/archive/2026-11-fullflow/delivery-evidence/implementation/`, with exact Git blob verification. Kept `docs/design-system-v6-1-migration.md` because the active design-system documents explicitly depend on its checklist; kept `docs/public-site-admissions-remaining-work.md` because the public publishing specification links to it. These retained documents need an explicit current-main review before retirement.

## Phase 11: non-truncated tree inventory and dated evidence retirement (2026-11-07)

Captured the complete recursive Git tree from `main` (2,510 entries; `truncated: false`). Archived and retired 16 dated documents covering isolated FullFlow Neon migration evidence, integration/agent handoffs, visual design checkpoints, and November browser/route test findings. See [the exact source-to-archive manifest](archive/2026-11-fullflow/README.md). The operation reuses source Git blob SHAs and removes originals in a single tree update, preserving historical bytes exactly. Targeted filename searches found no active inbound document consumers for these candidates, but this is **not** exhaustive link/CI validation.

Active, potentially operational instructions such as `docs/neon-development.md`, `docs/identity-and-demo-access.md`, `docs/school-operations-security-gates.md`, and `docs/platform-route-contracts.json` remain at their existing paths. Proposed SQL under `docs/migrations/` remains untouched.

## Phase 11 post-move verification

Verified against `main` commit `5041d51554586356b661545b00198d24f424db79`:

- Compared all 16 archived paths with their source entries in the parent Git tree. **All 16 archive blobs match exactly, and all 16 original paths are absent**.
- Inspected **69 active Markdown files** (`docs/` excluding archive, root `README.md`, `AGENTS.md`, and Copilot instructions) for inline relative Markdown links. Checked **74 local targets** (including two directory links). **No missing path targets found**. One transient read failure was retried successfully.
- Checked the archive index's **24 local links**. All targets exist in the Git tree.

This is a targeted structural audit, **not** a complete repository-wide reference audit: raw path strings in code, reference-style Markdown links, anchor fragments, archived historical links, external URLs, and semantic correctness were not validated. CI, test execution, build and runtime journeys remain unverified.

## Phase 12: historical product and integration evidence (2026-11-07)

Retired seven additional records using one Git tree operation with original blob SHAs unchanged. These include historical GF track identifiers, prototype-production mapping, FullFlow code audit, agent integration requests, church-source status and a dated Valor snapshot. Updated live source-document references in the Launch Studio and Valor acceptance documents. See [archive index](archive/2026-11-fullflow/README.md). Active security, Neon, route contracts, design authority and admission-publishing backlogs remain in place.

## Phase 13: reproducible documentation reference gate (2026-11-07)

Added `scripts/check-documentation-links.mjs`, `npm run docs:check`, and a required CI step prior to dependency installation. The validator uses Git-tracked paths, checks active Markdown inline/reference/HTML local links plus explicit `.md`/`.json` documentation references in source, scripts, tests and CI; archived historical bodies remain outside the gate, but the archive index is included.

Executed CI on commit `de28b9653b392b1bb920be3fb3353be1d03211a6`: **70 Markdown files, 109 Markdown targets, 1,926 source/CI files, 11 explicit source references, zero missing paths.** The documentation step succeeded again on Phase 12 commit `94d9545d40c0e1a9b5e3055279a5b36d38bebd32`. These counts are not claims that anchors, remote links, dynamic references, or document semantics were tested.

The earlier general CI run at `de28b965` separately failed in TypeScript typecheck due to a Node.js heap-out-of-memory error. Documentation validation passed; full CI success must not be inferred. The disposable Neon admissions workflow on Phase 12 commit failed its isolated-test-database-secret precondition. This is also separate from documentation path validation.

## Phase 14: selective Launch rebuild and dated acceptance evidence (2026-11-07)

Archived six additional dated records: FullFlow hybrid-site verification, November school visual and Valor website acceptance ledgers, Valor Algebra I activation, an old ESLint baseline, and November UX reconciliation. Git tree reuse preserves exact original blob SHAs. Updated the Algebra I pilot reference and the [November archive index](archive/2026-11-fullflow/README.md). Retained active security gates, source implementation notes, executable browser tests, academic content, operational runbooks, route contracts, and proposed SQL.

Created [School Launch and Run](product/LAUNCH-AND-RUN.md), anchored to inspected source at `08a6d832f9b9ba1d5f4d63d8c253cd995c4f34e8`: nine Hub cards, three explicit planned modules and a distinct Church Information product gap. Corrected the operating model so initial school creation is a Site stub, not automatic Program creation. This is a product and source-reference document, **not** release acceptance.

## Phase 15: design authority and media source contract (2026-11-07)

Archived the V5 editorial design note, the folder-first school media implementation handoff, and the dated Launch Hub implementation record, reusing exact original Git blobs and removing original paths. Updated the active Launch and Run contract to point to its historical implementation record in the archive. Created [Design Authority](design/README.md) and [School Website Media](product/WEBSITE-MEDIA.md); registered them with the documentation home, production design system, and Platform Capabilities. V6.1 remains the approved design direction. Source-observed media functionality is gated by `CAN_R2_SITE_MEDIA_UPLOADS_ENABLED`; real-world child-release evidence, external folder connectors, image-content classification and production browser/database/R2 acceptance are **not** represented as complete. No active safety, Neon, route contracts, or proposed SQL changed.

## Phase 16: Website Studio product contract and historical PR handoff

Created [Website Studio](product/WEBSITE-STUDIO.md) from a source-level inspection of `src/routes/launch.website.tsx`, `src/domain/public-site-templates.ts`, `src/domain/site-theme.ts` and local Site content publishing code. It clarifies Site ownership, independent publication/host/admissions states, five structural templates and the six-step authoring process. The code currently labels the third template **Modern Academy**; earlier product language called it **Modern Learning**, so this is a named decision to reconcile, not a silent replacement. Archived the outdated PR-status `docs/website-launch-studio-implementation.md` to `docs/archive/2026-11-fullflow/delivery-evidence/` with the original Git blob; linked the replacement from the home, Launch and media contracts. Browser/database and public host acceptance remain unverified.

## Phase 17: public-site publishing and admissions (2026-11-07)

The old 487-line `docs/site-public-publishing.md` and 507-line `docs/public-site-admissions-remaining-work.md` were retired from their original locations and preserved under [retired plans](archive/2026-11-fullflow/README.md) using their exact original Git blobs. These were FullFlow branch histories and priority lists, not a currently verified backlog.

Created [Public Sites and Admissions](product/PUBLIC-SITES-AND-ADMISSIONS.md) as the live product contract, retaining the institutional/local authority split, canonical inquiry → verified application → offer → enrollment → learning/operations continuity, and a source-pointer map. Created [Public Site Release Gates](quality/PUBLIC-SITE-RELEASE-GATES.md) to preserve historical privacy, edge abuse-prevention, safeguarding, multi-tenant, public-hosting and legally approved claim requirements as **unverified requirements**, not inherited passing status.

Updated Website Studio and Website Media links to the new contract. Retained `docs/public-tenant-hosting-release.md` as an operational reference with a warning that its Netlify-specific instructions cannot be assumed correct for Cloudflare Workers or another deployment provider. Active security gates, Neon runbook, route JSON, and SQL migration files were not moved.

## Phase 18: asynchronous-first academic product model (2026-11-07)

Created [Academic Delivery and Curriculum](product/ACADEMIC-DELIVERY.md), based on current source boundaries for publisher rights and Program adoption, instructor marketplace, Section classroom access, optional scheduled classroom meetings and learner activity. The product contract explicitly makes asynchronous recorded instruction the default, optional live tutoring/support distinct, and student-facing curriculum/presenter choice a **requirement not yet demonstrated end to end by current administrative teacher-selection code**.

Archived four FullFlow-era documents without altering the original Git blobs: the curriculum marketplace feature-branch architecture, the learning-activity early implementation, the connected learning → hybrid-site FullFlow plan, and the Agent G annual-adoption handoff. The detailed publisher-to-classroom architecture, school operations, learner test fixtures and safeguarding/security documentation remain active. The [archive index](archive/2026-11-fullflow/README.md) records the paths.

## Phase 19: extended learning and launch audience consolidation (2026-11-07)

The FullFlow summer/after-school implementation journal, October Section Operations lifecycle note and mixed October/November school Launch Studio planning document were archived from their original locations. The archive retains their exact Git blobs and historical observations. Canonical replacements:

- [Extended Learning](product/EXTENDED-LEARNING.md): Program types, draft Activity/Season, independent safeguarding and staffed sessions, guardian consent/identity, session-specific capacity, optional packages and financial obligation boundaries. Source services were inspected; real-operation acceptance has not been certified.
- [School and Site Operations](product/SITE-OPERATIONS.md): local host versus institution, Section/staffing/enrollment/waitlist lifecycle, physical day, attendance, supervision and custody-safe pickup. Safeguarding and school-of-record authority remain independent and binding.
- [Four-audience Launch Studio](product/LAUNCH-STUDIO-AUDIENCES.md): separate school, family, student and staff entry/commands, private draft integrity and unsaved-change safeguards. Source routes and scoped draft reader were inspected. Historical six-step school launch proposal is not the active school operator Hub contract.

Retained `docs/church-hosted-school-acceptance.md`, `docs/site-student-safeguarding-and-welfare.md`, `docs/school-operations-security-gates.md`, `docs/educational-capacity-model.md` and active operational runbooks because their exact safety or technical invariants require further source-level reconciliation. No app code, database schema or deployment changes in this phase.

## Phase 20: child-safety and institutional opening reconciliation (2026-11-07)

Created [Church-Hosted Safety Gates](quality/CHURCH-HOSTED-SAFETY-GATES.md) from main-source inspection of institutional school opening, jurisdiction versioning, five opening evidence categories, planned and witnessed adult coverage, daily onsite review, restricted safeguarding and external-report workflows, and custody/pickup commands. It traces nine required release gates and explicit negative acceptance cases.

The detailed church-hosted school-day acceptance, site safeguarding, school-operations security, multidisciplinary student support, and synthetic pilot HOLD documents remain active. They now link to the consolidated gate and distinguish dated FullFlow/October implementation evidence from current acceptance. **No safety contract was retired in this phase**: source inspection is not a substitute for legal review, deployed scheduler/notifications, independent real-world supervision, disposable database integration or authenticated multi-role browser tests.

Reorganized the documentation home into clear product, design, quality, engineering and archive sections. No application code, database schema or deployment configuration changed.

## Phase 21: safety test evidence and independent CI step (2026-11-07)

Reviewed nine [Church-Hosted Safety Gates](quality/CHURCH-HOSTED-SAFETY-GATES.md) against exact main source and test files. Created [Safety Test Traceability](quality/SAFETY-TEST-TRACEABILITY.md), differentiating mocked unit assertions, conditional isolated DB tests, scheduled-worker source integration, and missing connected browser/legal/physical evidence. In particular, three safety integration files use `describe.skip` when `DATABASE_URL` is unset; some explicitly mock staff eligibility and day-read services. A declared browser journey does not establish church-hosted school-day acceptance.

Added `npm run test:safety` containing thirteen focused unit files and a separate `School safety and opening unit regressions` GitHub CI step **before** Typecheck. At pre-change `7aedd4b`, CI documentation/build checks passed but Typecheck failed from Node heap OOM (exit 134); isolated Neon admissions failed its secret precondition. No database, application implementation, safety contract, or live release posture was changed by this phase. **Do not mark any of the nine release gates passed** based solely on unit regression results.
