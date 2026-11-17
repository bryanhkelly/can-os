# WS5: Program and Publisher Operations

**Branch:** `feature/program-operations`  
**Baseline:** `main@5e50d26c197330b3f01403c221f6646f8cbef823`  
**Integration target:** `integration/programs-courses-classes`  
**Owner:** WS5. **Release status:** NOT VERIFIED / DO NOT DEPLOY.

## Canonical hierarchy and source ownership

| Layer | Existing authority | Local action |
| --- | --- | --- |
| Blueprint | `education_v30.blueprints`, `blueprint_versions`, approved configuration/execution | Governed recipe; not itself an enrollment product |
| Offering | `offerings`, `offering_versions`; publisher-owned | Immutable published Course/Program product version |
| Program composition | `offering_courses`, `blueprint_components` (when applicable) | One Offering version may contain multiple ordered required/optional Course versions; other activities retain their separate native authority |
| Course | `courses`, `course_versions` | Published reusable curriculum and central assessments remain publisher-owned |
| Deployment/adoption | `program_deployments`, `deployment_offering_adoptions` | Independent operator adopts an exact version under approved time-scoped operation grant |
| Class | `classes`, optional `class_offerings` and versioned terms | Operator configures local title, Site, delivery mode, capacity; the Class points to exactly one published Course version |
| Session | `class_sessions` and WS4 Session authority | Operator schedules separate delivery, not a new Course or attendance ledger |

An Offering is not a Blueprint. A Course may be standalone, and multiple Classes may instantiate one Course version. **Do not synthesize Program rows** for standalone Courses or make a denomination/network a prerequisite to local delivery.

## Implemented in this branch

1. `getUnifiedClassCourseOptions` now performs **bounded server-side search and 50-result pagination** with stable ordering. It filters effective operation-operator Organization grants **and effective Site/Operation relationships before limiting results**. Authorized delivery modes and facilitated placement are evaluated in **set-based SQL** rather than N-per-Course/N-per-Site transaction loops. Current Class commands still revalidate all grants. A separate exact Offering/Course/Site filtered lookup makes imported rollout readiness independent of the first search page. Publisher definitions are sanitized to kind and Class policy, not returned raw.
2. The 6.1 Class operator workspace groups the currently adopted Offering versions and their ordered Course components. An operator can select a Course, inspect the publisher Offering context, configure a local Class, then navigate to existing Class/Session, curriculum, blueprint and deployment workspaces. Draft, published and closed Class Offering terms remain separate from Class activation.
3. Portable rollout **JSON format v2** carries an exact published Offering version, explicitly classified kind, numbered Course components, required/optional metadata and local Class setup suggestions. It contains **no** Organization/Site grants, content blobs, assessments, participant lists, certificates or permission to publish. Legacy v1 single-Class recipes remain parseable. `getPublisherRolloutTemplate` verifies current approved adoption, effective Organization **and Site** authorization and reads the *whole* canonical Offering Course composition. It rejects more than 50 components, duplicates, unavailable published Course versions and explicitly declared non-Course activities. Other separately governed Blueprint components must use their own lifecycle. This is an exhaustive **Course-component** export, not a substitute for Blueprint composition.
4. Local rollout readiness uses a separate **exact Offering/Course version/Site** authorization query with paginated follow-up for large adoption lists. It requires a selected physical/virtual Site and matching delivery mode before setup. The composer disallows unsited Class creation; historical unsited drafts remain untouched and unlaunchable. Each receiving operator explicitly creates its Class through `createUnifiedClassDraft` with existing canonical live checks, audits and events. No bulk enrollments or cross-Organization writes.
5. `product_definition.localClassPolicy` supports an optional **publisher-controlled variation policy v1**: lock local Class title, allow specified delivery modes and cap Class capacity (including rejecting unlimited seats when capped). It is checked in canonical server authority at creation and activation, not merely disabled in the UI. The absence of a policy preserves existing defaults. This is a restrictive published metadata contract; publisher exception *approval* requires independent WS00-governed workflow.
6. A new **`/canonical/program-operations`** workspace is linked from the 6.1 school admin and canonical navigation. It provides paginated publisher Product/Course hierarchy, independently verified approved adoptions by Site, six evidence-derived rollout stages, immutable-version notices, impacted Class counts and a bounded authorized affected-Class list. `getNativeOfferingVersionImpact` scopes each Class to its actual authorized Deployment/Operation/Site relationship, not just a broad Site ID. Counts are local to the operator's scope, **not national network figures**. No publisher edits or automatic upgrades.
7. The proposed durable plan/review/application/exception ledger, approval and RLS contract is specified in `docs/contracts/WS5-PUBLISHER-ROLLOUT-GOVERNANCE-V1.md` for WS00 approval only. **No ledger schema or event authority was created here.**

### Contract interface for WS1, WS2, WS4, WS6

WS5 returns existing canonical `deploymentId`, `adoptionId`, `offeringVersionId`, `courseVersionId`, `operatingOrganizationId`, and valid `siteOptions`. `offeringId`, `offeringTitle`, publisher Organization, Course code, required/sequence, and version numbers are **publisher/administration context only**, not participant attribution or new authority. WS1/WS2 own personal participation and enrollment status; WS4 owns Session delivery; WS6 owns reporting identifiers, counts and disclosure protections. No WS5 migration or event-code changes are needed in this increment.

## Two-Site and independent-provider acceptance cases

Use disposable **synthetic** identities, two approved Sites (A and B), two approved operator Organizations, and an Offering with two published Course versions. Do not use production or authentic learner data.

1. Publisher approves one Offering version with Course A1 and A2. Organization 1 holds an active operation operator grant and an approved adoption. Authorized Sites A and B have current operation-to-Site, Site-to-Organization and Deployment placement evidence. Import a v2 recipe, select each Course, independently create its local Class at both Sites. Verify four Classes reference the same published Course/Offering version IDs but distinct Class/Site IDs. No Course or Offering copy is created.
2. Revoke Site B's operation Site link, Site-to-Organization role, or active placement. The advisory checklist must show the missing Site; even if the client is stale or crafted, `createUnifiedClassDraft`, activation, and publication must deny for B. Site A must remain eligible.
3. Organization 2 without approved adoption/operator grant must not see an eligible Course or create a Class, even if it knows every UUID or receives v2 JSON. Network affiliate status or favorite Site must never grant operator authority. An independent Organization with its **own** approved operation, adoption and Site must succeed without any network membership.
4. Close/suspend a Deployment, adoption, or Offering version. Previously created Classes and attempts retain their pinned identifiers and historical records, while new activation/publication fails closed. A new Offering version requires a new approved adoption and revised recipe; old Class versions must never be silently upgraded.
5. Confirm Course A1 works as a standalone Course Offering, Course A1+A2 work as a Program Offering, and other approved blueprint activity components are not transformed into fictitious Courses or enrolled through the Class picker. Class Offerings may remain absent for assigned participation.

### Negative authorization assertions

- Cross-Organization UUID swaps in `operatingOrganizationId`, `deploymentId` or `adoptionId` denied
- Expired/ended operation operator grant, Site role, or adoption denied
- Site B denied after revocation, even when Site A remains valid
- Host/favorite/affiliate-only role cannot create publisher content or approve academic assessments
- Imported JSON with forged Site/Organization/adoption/assessment fields rejected as an unknown key
- Wrong published Offering version rejects local readiness, and server creation rejects mismatched adoption/course combination
- Published Course and assessment versions remain immutable; local variation limited to Class delivery fields, Session scheduling (WS4), staffing and presentation under their existing grants

## Verified test01 structure, not app acceptance

Read-only SQL was executed against the existing `test01` branch of Neon project `can-os`. The four native Class tables exist, each has forced RLS and one owner-only policy. `education_v30.offering_courses` exposes `offering_version_id`, `course_version_id`, `is_required`, `sequence_no`. `deployment_offering_adoptions` exposes `approval_status`, `valid_from`, `valid_through`, and pinned `offering_version_id`. `education_v30.deployment_sites` exists as the existing optional facilitated Site placement, not a new WS5 table. A follow-up read-only `has_table_privilege` probe reported **no direct SELECT or INSERT privilege** on `education_v30.classes` for `can_os_canonical_auth_app`, `can_v301_blueprint_test_app`, `can_v30_canonical_auth_reader`, or `can_v30_public_site_app`; these roles also lacked direct SELECT on published Offering versions and Deployment adoptions. This is privilege metadata only, **not** a successful authenticated negative-permission journey or proof of how the application establishes its DB connection. None of these metadata checks assert working restricted session grants, current deployment data, or runtime integration. No SQL mutation was performed.

## Migration and rollback boundaries

**Database changes: none.** No new catalog, duplicate Offerings, migration, backfill, GRANT/RLS change, or production write is proposed. The existing schema, restricted role provisioning and `CAN_UNIFIED_CLASS_COMMANDS_ENABLED` release flag still govern runtime availability. Do **not** enable the flag until WS00 proves the native Class table/permissions exist on test01 and completes its release gates. Code rollback is revert of this feature branch's commits; no data rollback is required because this increment changes no data structures.

## Verification ledger (update with actual executions)

| Check | Evidence | Status |
| --- | --- | --- |
| TypeScript / ESLint / 6.1 | `npm run typecheck && npm run lint` on exact PR SHA | **UNRUN** |
| Unit tests | `npx vitest run tests/unit/network-program-rollout.test.ts tests/unit/ws5-program-operations-boundaries.test.ts tests/unit/ws5-publisher-export-contract.test.ts tests/unit/ws5-program-operations-workspace.test.ts tests/unit/publisher-class-variation.test.ts tests/unit/program-rollout-lifecycle.test.ts tests/unit/network-class-launch.test.ts` | **UNRUN** |
| Build | `npm run build && npm run build:cloudflare` | **UNRUN** |
| test01 schema metadata | 2026-11-16, Neon project `can-os`, branch `test01`, database `neondb`: read-only `pg_class` / `pg_policies` / `information_schema.columns` queries. Confirmed `education_v30.classes`, `class_offerings`, `class_offering_versions`, `class_sessions`, Offering/Course and adoption/Deployment tables and expected columns. The four native Class tables show `relrowsecurity=true`, `relforcerowsecurity=true` and owner-only policy. No writes performed. | **STRUCTURAL CHECK ONLY** |
| test01 / restricted RLS | Authenticated two-Site role grant, cross-Organization denial, Site B revocation, full app-path authorization | **UNRUN** |
| Authenticated E2E | One-hour pilot, two-Site four-session pilot, school/guardian | **UNRUN** |

The pure unit tests describe authorization differences but are **not database or authenticated browser evidence**. GitHub Actions has reported `startup_failure` without running test jobs, and the Cloudflare Workers build check has reported `failure` without exposing compiler diagnostics through GitHub. Neither is a pass. If CI cannot execute, this PR remains draft. WS00's provisional Participation Read Model v0.1.0 must be ratified before integrating dependent changes. **Shared-file collision:** WS2 PR #309 also edits `src/modules/classes/unified-class.functions.ts` and `src/routes/canonical.classes.tsx`. WS5 has matched WS2's current **UI** options (self/assignment, not invitation/approval/for-credit). **WS2's server-side publication policy is still mandatory** before release. WS1 PR #308 also edits `docs/platform-route-contracts.json`, which WS5 extends with its new route. WS00 must merge these shared files deliberately, rebuild route generation, rerun all workstream suites and approve the handoff; see PR #307.

### Known limitations and follow-on ownership

- V2 rollout recipes are **portable versioned instructions**, not a persisted rollout approval ledger or automatic multi-Site publish engine. Publisher **restrictions** are enforceable through the published policy v1. Individual exceptions, approval evidence, durable rollout status and cross-Organization rollout invitations require WS00-approved ledgers, RLS and event contracts (proposal linked above).
- Publisher classification is displayed only when `offering_versions.product_definition.kind` explicitly contains an approved kind. Otherwise display `Published Offering`; never infer product type from Course count.
- The operator picker now provides search and 50-row pagination, with effective authorization filtered in SQL. Very large catalogs still require cursor-based keyset pagination, query-plan monitoring and indexing review; offset pagination is bounded to 100,000 rows. Export rejects over 50 Course components rather than silently exporting an incomplete Program.
- The active native Class commands intentionally require a real/virtual canonical Site; WS5 now prevents the operator UI from creating dead-end unsited drafts. Existing provider-wide unsited drafts need a separate approved Site-attachment workflow if they are to become activatable.
- Integration acceptance must test both mode branches (Site eligible for self-paced only versus Site with explicit classroom placement), active/revoked Site role, and publisher updates that require adopting a new immutable Course/Offering version.
- Blueprint-contained non-Course activities retain their own governed editor and lifecycle. Do not expose them as native Classes without a real Course-version reference. Launch Studio remains unchanged.
