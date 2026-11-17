# WS5 integration-to-main release checklist

**Status: NO-GO pending executable CI, integration reconciliation, SQL governance and authenticated acceptance.**

Owner: WS00 release manager. Implementer: WS5 PR #312.
Original WS5 baseline: `main@5e50d26c197330b3f01403c221f6646f8cbef823`.
Main moved to `5f0f09a59d0d14eb0d1cc8a16f2b09d32dd160aa` during WS5 review;
this is a recorded observation, **not an invariant**. Refresh all HEAD SHAs
immediately before attempting an integration or main merge.

## Preserve branch and source ownership

- WS5 head must remain `feature/program-operations`, PR #312 into
  `integration/programs-courses-classes`. Never force-update `main` or
  overwrite the shared integration branch.
- WS1 PR #308 also modifies `docs/platform-route-contracts.json`; preserve
  both its route entries and WS5 `/canonical/program-operations`.
- WS2 PR #309 also modifies `src/modules/classes/unified-class.functions.ts`
  and `src/routes/canonical.classes.tsx`. Preserve WS2's
  `assertOperationalClassOfferingTerms` **in the publish command** and WS5's
  set-based, paginated read APIs and site-specific rollout UI. Do not replace
  server-side methods with client option lists.
- WS3/WS4/WS6 own outcomes, Sessions, delivery and reporting. No WS5 changes
  to Enrollment, Course Attempt, Assessment or Outcome authority.
- `main` contains later Cloudflare release-gate and build fixes. WS00 must
  update integration against latest verified `main` non-destructively and
  retain those fixes before any release.
- Re-run route generation because WS5 adds `canonical.program-operations.tsx`.

## Hard CI gates at the exact integration SHA

On a reproducible clean checkout, with required environment configuration:

```bash
git rev-parse HEAD
npm ci
node scripts/acceptance/check-ws5-integration-contract.mjs --integrated
npm run db:check:journal
npm run db:check:main
npm run build:cloudflare
npm run build
npm run typecheck
npm run lint
node scripts/check-platform-route-contracts.mjs --check
npx vitest run \
 tests/unit/network-program-rollout.test.ts \
 tests/unit/publisher-class-variation.test.ts \
 tests/unit/publisher-rollout-approval.test.ts \
 tests/unit/program-rollout-lifecycle.test.ts \
 tests/unit/ws5-program-operations-boundaries.test.ts \
 tests/unit/ws5-program-operations-workspace.test.ts \
 tests/unit/ws5-publisher-export-contract.test.ts \
 tests/unit/ws5-publisher-rollout-migration-contract.test.ts \
 tests/unit/network-class-launch.test.ts
npm run test:classes:unit
npm test
```

These commands are **instructions for WS00** and have not executed on this
feature branch. A GitHub Actions `startup_failure` with zero jobs is never
a successful gate, nor does a Cloudflare build of a different `main` SHA
certify WS5.

## Database, identity and schema approval

- The existing `test01` canonical Class tables were verified structurally
  with read-only Neon SQL. This is not proof of successful restricted RLS or
  authenticated operation.
- `database/canonical/v3.0.1/patch-publisher-rollout-approvals.sql` is a
  **draft migration candidate**, NOT applied and NOT in the default migration
  sequence. WS00 must review DDL semantics, independent reviewer/session
  binding, dedicated restricted role policies, state transition and
  append-only triggers, and approved migration ordering before applying it to
  an isolated disposable child of `test01`.
- No public role or operator role has ledger access merely from the candidate.
  Publisher author/reviewer identity and independent grant review must be
  implemented and approved before enabling any ledger write endpoint.
- The existing Class command gate `CAN_UNIFIED_CLASS_COMMANDS_ENABLED`
  must remain disabled until Class identity, Site placement, session
  revalidation, version pinning and publication guards are tested.
- Do not infer a schema migration from a Drizzle TypeScript mapping alone,
  and do not add new Drizzle tables to the default journal until migrations
  and snapshots are reconciled with WS00.

## Authenticated acceptance using only synthetic test01 fixtures

1. Independent operator, no network membership, two approved published
   Course versions under one Offering and current adoption succeeds.
2. Site A virtual self-paced Class succeeds; facilitated Class requires
   exact Deployment/Site placement.
3. Site B with valid grants separately succeeds; four local Classes are
   distinct identities but pin the same required published Course versions.
4. Revoke Site B grant/placement: Class create, activation and registration
   publication fail. Site A remains unaffected. Stale UI/UUID commands deny.
5. Operator from another Organization, affiliate/favorite-only member and
   wrong adoption/offering/course UUID cannot read or create local Classes.
6. Published local variation rules lock Class title, delivery mode and maximum
   capacity server-side; a null unlimited capacity fails when a ceiling exists.
7. New publisher version shows impact but never silently upgrades Class,
   Course Attempt, Session, Enrollment or official Outcomes.
8. A Program with a missing/unpublished required Course or separately
   governed Blueprint activity fails closed on Course-only rollout export.
9. A privately assigned Class can be active without a Class Offering; only
   independently supported enrollment methods can be published by WS2.
10. Publisher-reviewer cannot approve their own proposed plan or local
    application; unapproved or stale grants remain denied, with immutable
    decision evidence **once the separately approved ledger is implemented**.

After successful isolated tests, capture test IDs, timestamps, roles, exact
SHA, SQL role, result and logs for WS00 review. Do not use real learner data.

## Final handoff and rollback

- WS00 reviews all six PRs, resolves shared-file conflicts and confirms
  the versioned Participation Read Model owned by WS1.
- Keep any unapproved draft ledger migration out of the release artifact.
  WS5's read-only functions and policy enforcement must be tested on their
  own before activation.
- Production SQL and release flag changes require explicit release approval.
- Rollback via reviewed code revert and feature flag off; preserve recorded
  Class/Enrollment evidence. Do not delete or migrate historical learner
  records to roll back a publisher product version.

**Only WS00 marks GO after independent evidence. No P0, CI, release, or
schema gate is satisfied by the existence of this checklist.**
