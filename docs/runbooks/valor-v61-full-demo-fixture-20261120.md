# Valor School V6.1 full synthetic demo data

**Applied:** 2026-11-20 to Neon CAN OS project `sweet-hall-62441909` branch `main` (`br-restless-sea-ar9ooo55`), default database `neondb`.

**Scope:** only the fictional Valor School Site `f1000000-0000-4000-8000-000000000003`, its existing publisher Organization `f1000000-0000-4000-8000-000000000002`, and explicit deterministic synthetic fixture identities. The data must not be represented as a licensed, accredited, verified, completed, consented, or operational school.

## Applied in order

All SQL files live under `scripts/recovery/`, and their writes ran successfully as guarded, atomic database operations. The initial preparation of canonical Courses, Class Enrollments and unpublished lessons is documented in the prior [rehydration runbook](./valor-v61-rehydration-20261120.md).

1. `valor-v61-full-demo-phase1-20261120.sql`: mark the 20 pre-existing V26 test learners explicitly synthetic; preserve all verified-like guardian relationship examples but mark them `notLegalEvidence`; assign Riley to 12 canonical Classes; include suspended facilitator example; activate 16 V26 learner personas across 96 existing Class assignments with native Course Attempts; leave V26-117..120 pending. Does not recreate Sections/Cohorts.
2. `valor-v61-full-demo-phase2-20261120.sql`: canonical submitted/returned/graded-*simulation* and assigned homework records, learner lesson progress, and per-Course Attempt unit progress. Preserve unstarted homework, preserve existing submissions, and do not issue official grades or change Course publication.
3. `valor-v61-full-demo-phase3-20261120.sql`: add three simulated Site Spaces with Facilities V6.1-compatible resource shapes; a device policy plus four hypothetical device statuses; three immutable-Brand-pinned editable **draft** marketing Packages. Do not publish collateral or assert real accessibility/occupancy/managed inventory.
4. `valor-v61-full-demo-phase4-20261120.sql`: four fictional admissions prospects and associated Deployment interests, three simulated internal message threads with six messages. No real communications, outbox delivery, admissions offers, legal consent or authentication.
5. `valor-v61-full-demo-phase5-assessments-20261120.sql`: 12 subject-specific, **draft** canonical Formative Assessments with three short-response items each, Forms and question banks. Not authorized for student assessment without independent review.
6. `valor-v61-full-demo-phase6-surveys-20261120.sql`: draft learner and guardian feedback Surveys, eight questions in all and two draft Campaigns. No invitations, survey responses or public reporting.
7. `valor-v61-full-demo-phase7-draft-curriculum-20261120.sql`: creates seven separate **draft** Course Version 2 authoring examples and 28 contentful lessons (four per Course, including the copied introduction). The original published Course Version 1, all live Classes and all existing Course Attempts remain unchanged. These drafts do not appear in Jordan's active Classes until properly reviewed and adopted; do not bypass published-version immutability.

**Acceptance SQL:** `scripts/acceptance/check-valor-v61-full-demo-20261120.sql`. It is read-only and checks 31 exact or minimum fixture invariants. On the final run, **31 passed and zero failed**.

## Verified live data (after all phases)

| Domain | Verified |
| --- | ---: |
| Active self-paced Classes | 12 |
| Active learner-Class Enrollments | 105 |
| Active canonical Course Attempts | 105 |
| Pending placements | 25 |
| Historical withdrawals | 1 |
| Jordan's active Classes | 9 |
| Approved synthetic teacher Class assignment records | 12 |
| Published native Course lessons (unchanged) | 746 |
| Draft next Course Versions for thin courses | 7 |
| Lessons in draft next Course Versions | 28 |
| Written assignment definitions | 24 |
| Canonical homework records | 210 |
| Submitted / returned / graded-simulation homework | 32 / 11 / 9 |
| Canonical lesson progress records | 195 |
| Canonical unit progress records | 93 |
| Draft formative assessments / short-response questions | 12 / 36 |
| Simulated facilities / devices / draft marketing Packages | 3 / 4 / 3 |
| Fictional admission prospects / in-app messages | 4 / 6 |
| Draft learner and guardian Survey campaigns / questions | 2 / 8 |
| Dangling or cross-attributed Course Attempts | 0 |
| Official course grades issued | 0 |
| Actual Class Sessions scheduled | 0 |

**Jordan scenario:** 9 active native Class Enrollments, one previous withdrawal retained, 18 written homework assignments including 14 still assigned, two submitted, one returned, one graded-simulation; existing subject-specific YouTube URLs remain in `course_lessons.content.resources`, with separate supplemental demonstration video candidates. This fixture can display realistic history and preserves unsubmitted homework for authentic interactive testing.

**Staff scenario:** Riley now has approved synthetic `class_staff_assignments` records for 12 Classes. These records do **not** prove runtime educator access. The canonical staff mutation service independently requires a verified room-facilitator grant at the exact Site and rejects demo-account emails. The fixture does not circumvent that requirement. Sally's simulated facilitator assignment is suspended; her account verification is incomplete. The class-assignment bulk fixture's direct SQL authoring does not by itself issue professional credentials, assign grading authority, or provide audit evidence equivalent to a production appointment.

**Guardian scenario:** existing Morgan-Jordan relationship retained. Other V26 parent relations marked simulated and **not legal evidence**. No other learner accounts were created or falsely email-verified: only Jordan had an existing verified synthetic student access account. The 16 additional active V26 learners are legitimate synthetic roster and reporting scenarios, not newly proven interactive logins.

## Replay discipline

These guarded scripts use deterministic IDs, preserve existing canonical Course Attempts, and avoid overwriting existing homework submissions/lesson progress. They expect the exact canonical V6.1 initialization, synthetic Valor Site, and earlier rehydration prerequisites, not an empty database. Use an isolated Neon branch cloned from the intended recovery baseline for rehearsal, with correct branch capacity and rights. Run the phases in order in `psql` with `ON_ERROR_STOP=1` and run the acceptance SQL after any replay. Do not apply to another Site, reassign real-world authorizations, or merge this fixture into normal production migration chains.

## Remaining acceptance boundaries

- **Data-integrity accepted**: 31/31 SQL checks. This does not mean the latest app code has deployed, compiled or passed authenticated browser tests.
- **Student journey:** sign in directly as Jordan; inspect nine self-paced Classes and original lesson video links; submit one still-assigned response, reload, confirm its Course Attempt and state, and verify lesson-progress persistence.
- **Teacher journey:** after a valid authorization path is established, sign in as Riley, inspect only assigned Classes, review and return one written submission, and confirm Jordan's view updates. Do not weaken staff guard conditions to accommodate demo data.
- **Guardian journey:** Morgan can see only Jordan's authorized academics; confirm separate V26 learner data is not visible.
- **Admissions journey:** preserve four pending V26 learners and one distinct older admissions fixture; verify prospect pipeline changes in the app without sending messages.
- **Course authoring:** review draft v2 content, publish via the governed workflow only after approval, and deliberately transition individual Classes only with proper dependency migration. Never update a published Course child in place.
- **Safety:** separate real Course/Offering rights, staff verification, legal consent and official accreditation from synthetic statuses. Review supplemental videos and student accessibility before any genuine delivery.
- **Deployment/build:** latest source commit, TypeScript validation, architecture checks, focused test suite, and Cloudflare/Netlify deploy status must be verified independently. This database load does not constitute deployed UI functionality.

## Example read-only check

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-full-demo-20261120.sql
```
 
## November 20 follow-up: safe community and wellness scenarios (phases 8–12)

All five additional phase scripts were executed against the exact fictional Valor Site in Neon `main`. The additive acceptance suite `scripts/acceptance/check-valor-v61-safety-community-20261120.sql` was executed after loading and reported **33/33 passing, zero failures**. The earlier 31-check baseline covers academics and administrative fixtures.

8. `scripts/recovery/valor-v61-full-demo-phase8-groups-20261120.sql` provides three new groups, six memberships, six posts, one review-pending moderation report, three practice Sessions, and one simulated Jordan RSVP. Jordan's Biology membership is a *synthetic workflow state*, **not a valid guardian signature**. Other new invitations remain pending. Two older fictional groups were reconnected via metadata to their canonical Class, preserving original Section IDs in archival metadata only. All seven Valor study groups have zero active `section_id` foreign keys.
9. `scripts/recovery/valor-v61-full-demo-phase9-trips-20261120.sql` adds three future fictional trip proposals (science museum, photography walk, robotics) and eight invitations. **Zero** real approvals, verified signatures, chaperones, transport, boarding, departure/return checkpoints or payments were created. All three trips remain proposed; no live travel is authorized.
10. `scripts/recovery/valor-v61-full-demo-phase10-health-safety-20261120.sql` adds three medical-tier *fictional* health profiles, three fictional compliance statuses, two mock office-desk visits, and two **closed low-severity training-only** incident records. The examples are not diagnoses, valid clinical orders, medications, health clearances or actual care. Zero active safeguarding reports, respondent appointments, emergency notifications, medication authorizations or administrations were fabricated.
11. `scripts/recovery/valor-v61-full-demo-phase11-class-discussions-20261120.sql` adds four **private** canonical Class-context discussion threads for Jordan and Riley (Algebra I, Biology, English 9 and U.S. History), 12 fictional messages and exactly eight Person participation records. These are internal demonstration records and have not been sent to external providers.
12. `scripts/recovery/valor-v61-full-demo-phase12-group-calendar-20261120.sql` projects the three new group practice Sessions into native Calendar events and Scheduled Occurrences. It also clears remaining retired Section references from the two historically migrated groups' Calendar/Occurrence records. The old IDs remain as archival metadata.

### Verified counts following phases 8–12

| Domain | Verified |
| --- | ---: |
| All Valor study groups; still referencing a retired Section | 7; 0 |
| New group records / memberships / posts | 3 / 6 / 6 |
| New future group Sessions with matching Calendar projections | 3 |
| New trip proposals / invited learners / real permission references | 3 / 8 / 0 |
| New mock health profiles / compliance statuses / wellness visits | 3 / 3 / 2 |
| Closed training incidents / open real incidents | 2 / 0 |
| Active safeguarding cases or appointed responders | 0 |
| New private Class threads / messages / participating Persons | 4 / 12 / 8 |
| Current native published Class lessons unchanged | 746 |

### Class discussion and study-group code integration

The existing communication tables were reused, rather than adding parallel message storage. New `src/modules/classes/native-class-discussions.functions.ts` and `src/components/learning/NativeClassDiscussionPanel.tsx` implement student/teacher private read/reply functionality in the existing Class workspace. `src/modules/communication/current-canonical-class-thread.server.ts` and updates to `messages.functions.ts` recheck current Class enrollment, Course Attempt or assigned teacher authority before displaying old private threads from generic Messages. The new discussion tab is included for both learner and teacher Class views, but currently exposes only the explicitly seeded, private synthetic threads. No student-to-student direct messaging or broadcast was introduced.

For Class-linked study groups, the existing authorization functions now check live native `class_enrollments`, `classes` and `class_staff_assignments` using the metadata canonical Class reference. No new Sections or Cohorts were created. Some older group creation/discovery and legacy academic discussion routes **still contain retired Section dependencies**; complete their cutover before declaring the entire study-group product canonical. Adding these fixtures is not itself proof the new UI has deployed or that any signed-in persona has passed browser acceptance.

**No legal consent or emergency actions:** All health and child safety cases remain fictional. Independent safety coverage, mandated reporting, medical review, guardian permission, eligibility to board transport, and verified staff appointments must still run through governed services. A `status='approved'` field in historic synthetic test records must not be treated as actual independent authorization.

### Read-only regression checks

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-full-demo-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-safety-community-20261120.sql
```

The **33 new SQL assertions passed** on Neon `main`. TypeScript, the full application build, CI, a recent Cloudflare deployment and real Jordan/Riley/Morgan browser paths have **not been verified here**. They remain separate release gates.
