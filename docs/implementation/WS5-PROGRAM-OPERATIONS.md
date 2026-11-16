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

1. `getUnifiedClassCourseOptions` now filters by currently approved, time-valid **operation-operator Organization grants before bounding the list**, and returns a canonical publisher / Offering version / Course version hierarchy. It does not send raw publisher product definitions to the browser. Existing command-time checks still enforce current deployment, adoption, Course, Site, and effective roles.
2. The 6.1 Class operator workspace groups the currently adopted Offering versions and their ordered Course components. An operator can select a Course, inspect the publisher Offering context, configure a local Class, then navigate to existing Class/Session, curriculum, blueprint and deployment workspaces. Draft, published and closed Class Offering terms remain separate from Class activation.
3. Portable rollout **JSON format v2** carries one published Offering version, explicitly classified kind, numbered Course components, required/optional metadata, local Class setup suggestions, and a recipe revision. It carries **no** Organization/Site grants, content blobs, assessments, participant lists, certificates, or permission to publish. Legacy v1 single-Class recipes remain parseable.
4. Local rollout readiness compares the exact Offering version + Course version against current operator-visible adoptions, and optionally checks a chosen Site. It only advises on setup. Each receiving operator must explicitly create a Class under `createUnifiedClassDraft`, which independently verifies live grants and writes audit/domain events. No bulk enrollments or cross-Organization mutations.

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

## Migration and rollback boundaries

**Database changes: none.** No new catalog, duplicate Offerings, migration, backfill, GRANT/RLS change, or production write is proposed. The existing schema, restricted role provisioning and `CAN_UNIFIED_CLASS_COMMANDS_ENABLED` release flag still govern runtime availability. Do **not** enable the flag until WS00 proves the native Class table/permissions exist on test01 and completes its release gates. Code rollback is revert of this feature branch's commits; no data rollback is required because this increment changes no data structures.

## Verification ledger (update with actual executions)

| Check | Evidence | Status |
| --- | --- | --- |
| TypeScript / ESLint / 6.1 | `npm run typecheck && npm run lint` on exact PR SHA | **UNRUN** |
| Unit tests | `npx vitest run tests/unit/network-program-rollout.test.ts tests/unit/network-class-launch.test.ts` | **UNRUN** |
| Build | `npm run build && npm run build:cloudflare` | **UNRUN** |
| test01 / restricted RLS | Isolated two-Site role/revocation and schema preflight | **UNRUN** |
| Authenticated E2E | One-hour pilot, two-Site four-session pilot, school/guardian | **UNRUN** |

The pure unit tests describe authorization differences but are **not database or authenticated browser evidence**. If CI cannot execute, this PR remains draft. WS00's provisional Participation Read Model v0.1.0 must be ratified before integrating dependent changes.

### Known limitations and follow-on ownership

- V2 rollout recipes are **portable versioned instructions**, not a persisted rollout approval ledger or automatic multi-Site publish engine. Formal publisher-approved variation and durable rollout approvals require WS00-approved governance and schema migration sequence before implementing.
- Publisher classification is displayed only when `offering_versions.product_definition.kind` explicitly contains an approved kind. Otherwise display `Published Offering`; never infer product type from Course count.
- The current operator option query is bounded to 100 authorized Course rows; server-side search/pagination is still needed at very large catalog scale.
- Blueprint-contained non-Course activities retain their own governed editor and lifecycle. Do not expose them as native Classes without a real Course-version reference. Launch Studio remains unchanged.
