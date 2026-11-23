# Release 11232026: Platform Owner and COGIC pilot operations

Status: **source committed, not released**. The feature branch is `release-11232026`. Neither `main` nor Neon production has been migrated by this work.

## What exists

- The new `platform_owner` is an account-wide role with platform administration and owner delegation. It does not inherit institutional approval or learner permissions.
- `/platform` shows **Pilot access setup**, **View as / Act as**, and **Release Center**.
- Existing verified, active non-demo CAN Persons can receive one of five audited, organization/Site-scoped pilot roles. An owner may revoke those exact grants.
- Owner delegation uses the original server-issued CAN session, keeps `active_grant_id` owned by the Platform Owner, and projects the selected existing grant only for a short session window.
- Delegation is limited to 15 minutes, names the effective actor in a persistent banner, and has a return-to-owner command.
- View as is read-only at the CAN command-context boundary. Act as retains the target's existing capabilities and scopes. Protected reviewer, safeguarding, network and platform roles are view-only. Never use owner delegation to attest that somebody else reviewed content, verified evidence or consented.
- Release Center uses existing publisher readiness records. The two COGIC pilot Offering codes are prioritized and display training state, assessment state, approved-person status, lesson media placeholders, lesson review flags and native Offering/Course progress.

## Rollout order

1. **Migration:** apply `drizzle/0104_platform_owner_delegation.sql` (and required preceding migrations) on an isolated Neon branch and verify constraints/indexes and pre-existing CAN sessions. No changes to production from this runbook.
2. **Build:** run TypeScript typecheck, lint, unit tests (including `platform-owner-delegation.test.ts` and `platform-owner-pilot-access.test.ts`), integration tests and a production-style build against the exact Git SHA.
3. **Provision:** select an already verified, non-demo CAN Person and a distinct authorized external approver. Confirm the ticket and run the dry-run `scripts/provision-platform-owner.mjs`, then explicitly `--execute` only against the approved production database. The script is not self-activating.
4. **Smoke test:** sign in as the provisioned owner, open `/platform`, verify current release status; provision a scoped pilot role for a different verified Person; revoke it; ensure the target cannot retain it.
5. **Delegation:** View as a verified viewer; confirm no writes are accepted. Act as a creator; verify effective actor, Site and Organization scoping, audit and 15-minute expiry. Return to owner from the banner. Test invalid/stale/revoked grants, external-origin POST, shared-device expiry, direct URL tampering and cross-tenant isolation.
6. **Publish content:** a distinct authorized publisher creator and independent reviewer must be Course-appointed and review evidence attached. Neither an App Admin grant nor Platform Owner delegation creates professional Course appointments, published assets or a publication approval.
7. **Launch:** after publisher reviews, assessment, training-version publication, exact Offering adoption, and authorized registration-release gates, run an end-to-end synthetic learner journey. Do not claim production enrollment or pilot completion until verified.

## Current COGIC blockers (verified with READ ONLY Neon main queries)

| Pilot | Courses | Lessons | Media placeholders | Lesson review flags | Noncredit training | Assessment |
|---|---|---:|---:|---:|---|---|
| Custom training, one hour | draft | 7 | 7 | 7 | draft | draft |
| AI and Digital Skills, four sessions | draft | 4 | 0 | 4 | draft | draft |

Both lack verified Course creator/reviewer appointments, submitted native content manifests, approved release policies and approved local adoptions. Neither has published noncredit training or independently recorded training approval.

## Open verification / constraints

- **Database branch quota:** a new Neon QA branch could not be created on November 23, 2026 because the project reported `branches limit exceeded`. Do not retire a named branch without a separate authorized branch lifecycle decision.
- **No real release evidence:** connected GitHub Contents API can commit and inspect files, but it has not executed the repository's TypeScript compiler, Vitest suite, integration tests, browser, deployment or migration.
- **Audit attribution:** native platform mutations using the shared `writeAudit` context retain original session ownership; verify older direct-audit writers before relying on delegated Act as for sensitive mutations. A permissioned pilot is not permission to manufacture an independent academic or safety decision.
- **Completeness:** training-version publication and professional Course appointment administration are independent workflows. New pilot grants do not make those workflows complete.

Do **not** merge or deploy until the migration and session tests pass. Treat all pilot outputs as demonstrations until real approvals are completed.
