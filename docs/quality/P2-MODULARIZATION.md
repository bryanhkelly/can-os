# P2 modularization and executable regressions

**Branch:** `release-11212026`  
**Scope:** Maintainability and behavior preservation; not a release certificate.

## Ownership and reuse

- `src/modules/operations/pickup-authority-queries.server.ts` owns live
  transaction-bound guardian, student, custody, attendance and pickup-notice
  queries. `src/domain/pickup-authorization-scope.ts` owns the pure exact
  Organization, Site and Program conjunction. Pickup command handlers still
  hold their transactions, idempotency, mutation audit and notifications.
- `src/modules/safeguarding/safeguarding-access-queries.server.ts` owns
  current Site and restricted case lookups. Safeguarding commands retain
  independent case-assignment, reporter-relationship and transaction checks.
- `src/modules/learning/report-card-record-query.server.ts` owns the
  read-only finalized-grade projection and authorized section predicates.
  Issuance, correction and grade-finalization command logic remains in the
  original module.
- `src/modules/enrollment/admissions-student-choices.server.ts` owns
  the bounded, verified student/guardian selection used for legacy admissions
  record reuse. Admissions mutations and relationship confirmation remain
  separately authorized in their existing server handlers.
- `src/domain/public-site-styles.ts` owns reviewed static CSS for the
  seven public Site designs. Renderers retain escaped content, template
  composition, publication and URL policies without injecting client scripts.
- `src/components/launch-studio/marketing-package-editor-state.ts` owns
  deterministic working-editor transitions. A single reducer controls
  opening, creating, duplicating, patching and discarding a plan without
  overwriting saved Release artifacts. Network requests, Brand revisions,
  release idempotency, unsaved-change navigation and download services remain
  separate effects and action handlers.

## Behavioral verification

Run `npm run test:quality:p2` to exercise real reducer transitions, exact
Pickup scope rejection, public Site stylesheet output for seven templates,
existing HTML safety and Marketing Package Site isolation. Existing admission,
safeguarding, pickup, transcript and report-card integration tests remain
part of their ordinary suites.

These tests do not replace full TypeScript checking, an application build or
live PostgreSQL acceptance. Run `npm run typecheck:full`, `npm run lint`
and the full build and test workflows at the same exact commit SHA before
claiming the refactor is production-ready. If GitHub Actions does not execute
any job steps, report verification as **unverified**, not as successful.
