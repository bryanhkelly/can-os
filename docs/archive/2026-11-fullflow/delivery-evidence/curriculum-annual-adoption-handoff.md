# Annual curriculum adoption — Agent G handoff

This feature intentionally does **not** alter legacy adoptions, Section version references, Launch UI, or importer flows. The canonical existing program and entitlement records remain authoritative.

* The annual adoption is an explicit Program + academic year + Pack record, pinned to one publisher release. An idempotent repeat for the same version returns `created: false`; conflicting upgrades are rejected rather than silently changing earlier Sections.
* `readAnnualAdoptionEligibility` requires the institutional `curriculum.adopt` capability and verifies organization, Program, Site, academic provider, entitlement, published release, year, and license validity. It fails closed if the annual adoption is missing.
* The caller **must** supply a canonical, server-resolved academic-year ID and start/end dates; do not accept client-supplied dates as proof of school-year applicability.
* Publisher rights require authoritative `licenseStartsAt`, `licenseEndsAt` and optional `withdrawnAt` entitlement metadata. For commercial content, the coordinator should require both dates, verify issuer provenance and avoid assuming a perpetual license when they are absent. The current domain helper accepts unbounded validity for genuinely perpetual licenses, so integration must require verified license terms.
* **Critical integration blocker**: Launch Mode's `listLaunchEligibleCourses` and `assertLaunchEligibleCourse` still use legacy Program-only adoptions. Integration owner must update their server-side predicates to use the annual reader before rollout can be accepted. No UI or importer paths were modified.
* **Schema blocker**: New table `curriculum_annual_adoptions` requires an additive Drizzle schema export and a coordinator-numbered migration. No migrations or shared DB writes were applied by Agent G.
* Rollback is fail-closed by status (`rolled_back`) but no rollback command is included; a separately authorized, audited rollback mutation must be provided before claiming rollback acceptance.
* Concurrency must be resolved using the unique database constraint and retry semantics; not verified without disposable Neon.

## Acceptance gates

Run `npx vitest run src/domain/curriculum-year-policy.test.ts`, typecheck, and isolated Neon schema/rollover acceptance after the coordinator serializes migrations. Test cross-program/site/provider access, previous-year rollover, revoked/withdrawn content, version pinning, concurrency, idempotence and audit attribution. Do not treat this branch as end-to-end accepted until the Launch integration and database gates pass.
