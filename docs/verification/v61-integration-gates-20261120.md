# CAN OS V6.1 integration gates (November 20, 2026)

This record distinguishes committed source, test-branch schema, and production
deployment. It must not be interpreted as release certification.

## Implementation changes in the feature branch

- Marketing Package editor and controller share one canonical set of wizard
  steps. The parent uses the required Lucide Copy icon import.
- Establish presents published Program ideas and broad learning interests as
  one intent choice, with **one** optional starting priority. Programs are
  not Solutions, Offerings or registrations.
- Introduce derives editable copy from published Program titles, chosen
  priority, Site Story and saved Site Brand. Unavailable/retired Program
  references are not silently included in outward-facing proposals.
- Package Release freshness includes canonical template revision, bound public
  destination URL where recorded, incomplete sets, and withdrawn outputs.
  Previously released bytes and Brand references remain immutable.
- Preopening family invitations freeze subject and introduction in the existing
  communication thread and optionally record the exact source Marketing
  Package ID/revision. A new send verifies that source belongs to the same
  Site and has not changed; idempotent retries retain the original send record.
- Read-only Solution discovery now requires Blueprint read authority, an
  exact current Site operator relationship, and active/published definitions.
  It never loads Site configuration drafts or gives configure/review/execute
  privileges. Its authentication and RLS behavior still requires executable
  cross-Site negative acceptance.

## Neon read-only inspection

Project: `sweet-hall-62441909`.

On `main` (`br-restless-sea-ar9ooo55`) the Drizzle journal's latest entry
was ID 87 (`created_at=1794990001000`). The marketing package table exists,
but `public.site_brand_versions`, `public.site_marketing_package_releases`
and `public.site_artifact_releases` were absent.

On isolated branch
`v61-launch-brand-migration-validation-20261119`
(`br-bitter-pine-ar7mjn70`), the Drizzle journal includes entries through
ID 98. The Site Brand, artifact and Package Release relations exist, with
immutable triggers on both artifact and Package Release tables. The branch
contained 3 Site Brand versions, 0 Marketing Packages, 0 Package Releases,
and 0 artifact outputs at inspection time.

All four inspected marketing/Brand relations have RLS enabled, not forced.
Their effective application-role privileges and multi-Site API authorization
remain to be verified. These read-only probes do **not** prove a valid
end-to-end release, atomic rollback, idempotency, media withdrawal,
distribution provenance or browser acceptance.

Neon reported ten existing branches and one manual snapshot from
October 21, 2026. Do not delete other work, reuse the old snapshot as a
current rollback point, or promote unjournaled changes to `main` without
a reviewed migration/retention plan and fresh recovery point.

## CI and visual evidence

The inspected GitHub Actions checks on the feature branch were marked
failed with zero recorded execution steps; decoded job logs could not be
retrieved. No compiler or application failure cause has been proven by
those checks alone.

The Netlify preview for PR #348, deploy
`6affdcaeff5c6867a4d5b7ce`, was explicitly skipped due to
`account builds usage exceeded`. Resolve this platform constraint
rather than editing code to suppress a failing status.

The independently reviewed visual-evidence ledger remains empty. Source
compliance does not establish rendered visual, keyboard or accessibility
acceptance; do not fabricate screenshots or a passed report.

## Acceptance sequence before merging to main

1. Pin an immutable commit SHA and obtain a working CI or local runner.
   Run `npm run typecheck`, `npm run build`,
   `npm run build:cloudflare`, `npm run lint` and the relevant Vitest suites.
2. Reconcile the standard Drizzle migration journal with the manually
   created 0087/0088 objects on `main`, compare exact definitions, and
   secure a fresh recoverable backup before any production writes.
3. In the existing isolated validation branch, create authorized test
   fixtures, then prove a multi-format Package Release is all-or-nothing,
   retry-idempotent and historically immutable.
4. Test restricted and verified CAN Site grants, a reader without configure
   authority, Site A versus Site B, and revoked/closed-Site negative paths.
5. Test Establish -> Website & Brand -> Introduce -> Package v1 -> edit ->
   v2 -> ZIP, plus the separate Recruit Families send-snapshot path.
6. Run representative mobile/tablet/desktop and keyboard/contrast/browser
   checks, recording actual screenshots and source hashes.
7. Only then stage a controlled merge and separately approved production
   migration. Never infer production readiness from a migration rehearsal.

This document reflects read-only inspection and code commits. It makes no
claim of successful migration application to `main`, full test execution,
signed-off visual evidence, email delivery, or operational approval.
