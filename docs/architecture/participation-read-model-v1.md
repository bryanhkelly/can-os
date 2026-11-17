# CAN OS My Activity: person-centered participation

**Implemented in:** `main` · DTO `1.1.0` with optional per-source continuation cursors.  
**Release state:** Source changes committed. No successful full build or authenticated
multi-Site browser acceptance has been recorded for these changes.

## Source of truth

My Activity is a **read-only composition**, not an Enrollment, membership,
attendance, outcome, evidence, or credential ledger. Its IDs remain those of the
original Program, Section, Class, noncredit Registration, Event participant, and
enrichment Registration. Deep-link targets always recheck authority.

**Key:** `source + ":" + sourceId`. The same ID in different systems is not
the same participation record. Waitlists are `opportunities[]`, never
`records[]` or a completion denominator.

## Authorization and account-wide participation

A real CAN session authenticates one CAN account and Person. The server retrieves
**all currently verified active grants for that exact account and Person**,
regardless of which authorized workspace is currently selected. It never adopts
a client-selected Site, role, dependent, or another Person as permission.

- Student Section and Program history requires that student's own verified
  student membership **at the record's Organization and Site**.
- Dependent Section history requires an independently **verified academic-read**
  guardian relationship plus the guardian's current exact-Site/Organization grant.
- Dependent Program and enrichment history requires an independently **verified
  enrollment-management** guardian relationship plus the same Site scope.
- Accepted personal Events are visible to their original Person. A dependent's
  accepted Event additionally requires verified guardian enrollment authority
  and a matching Site/Organization grant. An Event invitation is not attendance.
- A Site-specific membership cannot see sibling Site records just because both
  Sites belong to one Organization. An Organization-wide grant can cover its
  own Sites. Staff, publisher, network and unrelated family grants do not
  enlarge personal participation access.
- Native Class history requires an original CAN-to-canonical **Account/Person**
  bridge, current native verified learner grant, and the exact CAN login. No
  second interactive sign-in or native cookie is needed for this **read-only**
  history. Class mutations and playback retain their own authorization.
- Noncredit training uses its existing original verified adult CAN/native
  identity binding. A role switch never assigns another Person's records.

A revoked or absent membership/relationship may make historical records
inaccessible. History being stored is not proof of current viewing authority.

## Paginated historical reads

| Source | Original record and reader | Page |
| --- | --- | --- |
| School Section | School Enrollment + Section, including inactive/closed historical Sections | 40, timestamp + source ID cursor |
| School Program | Original `enrollments.kind=program` | 40, timestamp + source ID cursor |
| Family enrichment | Original activity Registration/Season/Program | 40, timestamp + source ID cursor |
| Event | Accepted original calendar Event participant | 40, timestamp + participant ID cursor |
| Native Class | Original `class_enrollments`, latest source-owned decision and unrevoked award | 50, exact timestamp + Enrollment ID cursor |
| Noncredit | Original noncredit Registration and latest Course Attempt | 50, exact timestamp + Registration ID cursor |
| Waitlist opportunity | Original account/Person-bound invitation or waiting-list intent, distinct from participation | 50, exact joined timestamp + waitlist ID cursor |

The initial `getMyActivity()` response returns the first page of each source.
`nextCursors` indicates where more history exists. My Activity's **Load older
activity** requests independently authorized `getMyActivitySourcePage` reads,
validates source identity, detects repeated IDs/stagnant cursors, and merges
records without creating another ledger. It can page beyond the old 100 and
500-record limits. A failed reader preserves its cursor for retry.

A source is `ready/complete` only after its current authorized source query
reaches the end. A reader with remaining pages is `ready/partial`, and failed
authorization/schema queries are `unavailable/unknown`, not an empty history.
Waitlist opportunities have their own independently paginated 50-row Person-scoped reader and `nextOpportunityCursor`. They are **never** added to `records[]`, and completed or cancelled waitlist intents are not represented as active enrollment opportunities.

## Official outcomes without invented completion

- School Sections can reference a genuinely **finalized grading-period** grade
  (`section_grades.id`), only with finalized reviewer and timestamp. This is
  not a diploma or implied full-course credit.
- Native Class outcomes reference the actual current independently governed
  Class completion decision. Revoked awards are excluded, and newer corrections
  supersede earlier decisions.
- Noncredit outcomes reference current source-owned completion decisions,
  including incomplete/voided decisions, not watch time or registration status.
- Program status `graduated` is a historical source status, **not** proof that
  an official diploma or certificate was issued.
- Accepted Events and classroom presence never turn into official attendance
  or completion just because the clock elapsed.

**Open dependencies:** Audit-grade actual-delivery Site, credited Organization,
network reporting unit, and verified completion/certificate provenance are not
available from every original source. Program-specific official issuance and
every Section's final transcript are not inferred when source evidence is absent.
These require source-authorized readers, not new participation rows.

## Integrations and release verification

The school source reader is
`src/modules/learning/account-school-participation.functions.ts`;
the pure membership policy is `src/domain/account-activity-grants.ts`.
Native and noncredit source paging stays in their owning services.
The composition and continuation handlers are in
`src/modules/learning/my-activity.functions.ts`; presentation is
`src/routes/learn.my-activity.tsx` using the 6.1 system.

Unit/source contract coverage includes verified mixed-role and two-Site grants,
guardian vs staff boundaries, 720-row pagination beyond previous limits,
cursor progression and duplication, and reference-only official outcomes.

**Still required for release:** An exact-SHA `build:cloudflare` and
`typecheck`, connected test01 reads with synthetic account/guardian
fixtures, negative Site/Person/RLS tests, native identity-bridge revocation
checks, source cursor paging while grants change, and signed-in browser
acceptance through load-more, offline/retry, academic Section history and
two-Site dependent records. The current GitHub Actions startup failures do
not establish a passing or failing application build.

`generatedAt` is the server read time, not an audit-grade
transactionally consistent snapshot across six independent systems.
