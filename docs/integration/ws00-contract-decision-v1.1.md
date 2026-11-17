# WS00 Contract Decision: Participation Read Model v1.1.0

**Decision:** Approved as a **provisional, display-only integration interface**, not an audit-grade source-of-truth or release sign-off.  
**Approved scope:** stable source-grain identity, source-status preservation, separate waitlist opportunities, viewer-scoped access and incomplete-coverage disclosure.  
**Owner:** WS1. **Consumers:** WS2–WS6. **Date:** 2026-11-16.  
**Integrated main synchronization:** `main@5f0f09a59d0d14eb0d1cc8a16f2b09d32dd160aa` integrated into `integration/programs-courses-classes` at `ffbe2a48a9e7e418d11693cc8c0b805a31132d0a`.

## Accepted contract decisions

1. **Primary user experience:** `/learn/my-activity`. Keep `/learn/activity` as an authenticated compatibility alias. Preserve `/learn/my-courses` and deep links for still-authoritative enrollment and learning actions; do not destroy `/learn/classes` discovery. Existing `/learn/my-programs` can redirect only after the new route survives authenticated checks.
2. **Participation grain:** `(source, sourceId)` where `sourceId` is the existing Enrollment/Registration ID. The Course Attempt, Section, Class, Site and Program identifiers are *references*, never replacement enrollment identities. Do not deduplicate several different registrations based on Person or Course version. Where one source legitimately covers multiple Course experiences, show nested child items/refs and retain the single enrollment count. Never silently discard a real Section.
3. **Source-specific statuses:** preserve canonical `sourceStatus` separately from display buckets. A noncredit `registered` may appear as a user-friendly upcoming/registered display, but MUST NOT be recoded as `active` in commands/reports. A pending request or 48-hour invitation is not an enrollment; waitlists live only in `opportunities[]` and have their own source identity when available.
4. **Historical distinction:** authorized historical participation metadata is different from permission to reopen protected content or make new assessment attempts. A past withdrawal/completion remains in history if the viewer has independent permission to access that past record. Viewer role changes must invalidate cached records and recheck current grants.
5. **Coverage:** `ready/partial` means **some** authorized source rows could be missing. `unavailable/unknown` is not zero. Existing source readers limit results and school Section readers focus on current catalog. Never label My Activity complete lifetime history.
6. **Scope/attribution:** account identity, favorite Site, denomination/network affiliation and effective roles are not interchangeable. A display name or chosen Site is not approved historical delivery Site identity. Do not fabricate `personId`, `operatorOrganizationId`, Site or credited affiliate to fill null fields. Cross-Organization/Cross-Site/guardian reads demand exact effective grants and RLS, and current signed-in authorization.
7. **Outcomes:** `completed` source status may be a completed enrollment, NOT independently verified program or Course completion, credential, school grade, attendance or credit. WS3 owns verified decisions and revocation references. WS6 must calculate authorized metrics from original canonical evidence, never by counting `records[]`.
8. **Events:** WS1 read model emits no lifecycle events. WS2–WS6 own named source events and idempotent integration payloads. Event consumers must carry source enrollment ID, Class/Session IDs where applicable, timestamp and evidence/decision version. A waitlist invitation is opportunity-only.
9. **Version control:** the current `v1.1.0` is a preview, adopted by WS00 for *integration planning* only. Breaking field, status, permission, evidence or metric changes require new version plus WS00 approval. The existing WS00 `v0.1.0` document remains the **future audit-grade target**, not the approved present DTO.

## Explicitly deferred, NOT ratified for production

- Complete historical pagination and multi-grant union for one CAN account.
- Auditable original Person/Organization/Site/Network attribution, exact source event IDs and as-of consistent snapshots across domains.
- Formal credential/completion/award currentness, transcript and native Class policy binding until WS3 migrations, provenance and independent reviewer commands pass.
- Genuine full network reporting grants and privacy-safe cross-provider exports until WS6 authorization and disclosure review pass.
- Published Class invitation/approval methods, for-credit native self-registration, guardian-youth native enrollment and automatic award issuance; these remain fail-closed.

## Cross-workstream P0 merge hazards (confirmed by code inspection)

| Area | Current feature source risk | Required resolution |
| --- | --- | --- |
| WS2 + WS5 Class publisher | WS5's `publishUnifiedClassOffering` omits WS2 `assertOperationalClassOfferingTerms(terms)` | Merge both publisher logic and WS2 server-side guard **before** publication, and preserve WS5 local variation rules |
| WS2 + WS3 mutation lock order | WS2 locks Class then Enrollment; WS3 `decideNativeClassCompletion` locks Enrollment first | Make both use Class FOR UPDATE → Enrollment FOR UPDATE → Course Attempt. DB concurrency test with withdrawal/cancel vs completion |
| WS1 + WS2 `learn.classes.tsx` | Both change personal Class controls/navigation | Keep WS1 My Activity links and WS2 withdrawal and verification actions |
| WS2 + WS5 `canonical.classes.tsx` | Both edit Class creation/publishing UI | Preserve WS5 publisher/Site composer and WS2 operational allowed methods/credit mode restrictions |
| WS1 + WS5 route contracts and navigation | Both edit shared JSON and workspace registry | Merge both route definitions and role-scoped links, no replacement wholesale |
| WS3 + WS6 official outcomes | WS6 records unverified Class outcomes; WS3 adds completion authority | `formalCompletions` must stay unavailable until WS3 current decision/void/revocation is tested end to end |
| WS4 + WS6 Session changes | WS4 adds cancellation/replacement and schedule-change events | Count immutable Session IDs without accidental double counting cancelled and replaced plans |

**Release gate:** run `node scripts/acceptance/check-ws00-cross-stream-guards.mjs` on the assembled integration source. This static gate is not a substitute for TypeScript, unit, SQL/RLS, race, browser or build tests.

## test01 read-only evidence checked directly by WS00

At read-only inspection on November 16:
- `education_v30.classes`, `class_sessions`, `class_enrollments` exist, each with zero rows.
- `noncredit_self_enrollment_releases` has one row with **zero null `site_id` values**; `noncredit_self_enrollment_claims` has zero null-Site rows. Earlier source documentation reported one null-Site QA release, which is now stale. **Presence of a Site ID is not proof of current Site approval.**
- Proposed `class_session_agenda_revisions` (WS4), `class_completion_policy_versions`/`class_enrollment_completion_pins` (WS3) and `publisher_rollout_plans`/`operator_rollout_applications` (WS5) are not present. No migration was applied by WS00.

## Non-release status

No runtime tests, migration apply, RLS negative-principal tests, authenticated browser acceptance or production build on the integrated six-workstream SHA have been executed by WS00. GitHub Actions observed `startup_failure` with zero jobs on multiple branches; this is neither a code failure diagnostic nor a test pass. Do not enable production feature flags or merge PR #307 into main until evidence is available.
