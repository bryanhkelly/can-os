# Prototype -> Production Mapping

The prototype is a UX/workflow reference. Production code must not preserve prototype shortcuts accidentally.

| Prototype concept | Production concept |
|---|---|
| `Portal` / `PortalId` | Workspace derived from Person + Membership + RoleAssignment + Capability + Scope + Relationship |
| `ChurchSite` | Organization + Site + Program |
| JSON student | Person + StudentProfile + Household/relationships |
| local React state | Neon-backed transactional persistence |
| localStorage stores | server-backed domain services |
| prototype workflow store | Action + DomainEvent + AuditEvent |
| scripted Ask CAN response | authorized AI query/action over domain services |
| role switcher | authenticated membership/workspace switcher |
| synthetic course | CourseTemplateVersion + Section |
| synthetic assignment row | Assessment + availability/publication state |
| synthetic submission | Submission |
| page-specific task | Action |
| one-off onboarding UI | Journey configuration |
| hard-coded state logic | Jurisdiction / requirement configuration where applicable |

## Copy from prototype

Copy or adapt selectively:

- visual design system
- reusable UI primitives
- page scaffolding
- excellent interaction patterns
- grading UX
- notification UX
- command/search UX
- accessibility improvements
- copy patterns that survived validation

## Do not copy as production architecture

- synthetic data files
- `prototype-*-store` modules
- localStorage persistence
- hard-coded people/personas
- portal permission levels
- page-level fake audit logs
- duplicated state across screens
- church-specific domain names where a generalized Organization/Site/Program model is required
- scripted AI evidence as a production data path

## Migration method

For each production Golden Flow:

1. open the corresponding prototype screens;
2. identify reusable visual components;
3. implement canonical production domain/service operations first;
4. connect the UI to those operations;
5. prove cross-workspace propagation with automated tests;
6. only then expand peripheral screen depth.

## Adapted production surfaces

The `academy-union-core` UI review informed the following adaptations. These
are production implementations over existing canonical services, not a copy
of the prototype's components, stores, personas, or workflow state.

| Surface | Production adaptation | Data and behavior boundary |
|---|---|---|
| Workspace foundation | Shared widths, breadcrumbs, panels, URL-backed detail navigation, status badges, initials, and optional responsive context rail | Existing verified membership and school/program selectors remain authoritative; the responsive top navigation is retained rather than introducing a second shell |
| Student learning | Enrolled My classes, class overview/classwork/feedback, separate catalog, section-scoped discussions and calendar links | Active enrollment and existing authorized assignment queries; catalog requests still use existing commands |
| Assignment detail | Section-preserving previous/next links, structured rubric criteria, separate lifecycle/timeliness labels | Existing draft, submit, attachment, and revision operations remain in place |
| Teacher assessment review | Selected-submission workspace, assessment queue, previous/next, real response, verified files, attempt history, rubric and feedback | Teacher capability plus taught-section/site/program checks; attachment lookup requires linked IDs, matching assessment, student uploader, category, verification and private provider; downloads are signed for 60 seconds |
| Family home | Prioritized needs, child initials, concrete attention reasons, exact-child shortcuts | Canonical guardian-owned Actions, attendance cases and notifications; no synthetic family state |
| Student 360 | Overview, academics, attendance, support and relationships detail panels | Existing authorized profile DTO; finalized results only, no invented mastery/progress or private-note editor |
| Admissions | Named applicants, scoped stage pipeline, next-step labels and selected application details | Canonical stages and readiness/offer/enrollment records; no local Advance-stage operation |
| Program launches | Portfolio first, recorded requirement counts/percentages, named blockers and explicit empty scope | Existing Launch Journeys and commands; a percentage is not activation permission, and unconfigured requirements are not shown as 100% ready |
| Calendar | Month/agenda and composable source/section filters | The authorized calendar feed carries canonical section IDs; all existing event/due-date commands remain server-enforced |
| Notifications | On-demand accessible modal tray and full notification center | Existing recipient-scoped reads and explicit persistent read-status command; opening the tray does not mark notices read |
| Ask CAN | Shared persistent conversation component for the page and modal drawer | Same authorized conversation/tools/confirmation service; no scripted answers or implicit browser-selected resource authorization |

### Navigation contracts

- Class detail: `/student/courses?section=<id>&tab=overview|classwork|grades`.
- Registration catalog: `/student/courses?view=catalog` (optionally `section`).
- Calendar: `view=month|agenda`, `source=site|section|personal|assessment|study_group`,
  and optional `section`, in addition to the existing exact `date`/`event` selection.
- Admissions: optional canonical `stage` filter alongside `siteId`/`programId`;
  `application` opens the exact application's existing commands.
- Guardian enrollment: `/guardian/admission-offers?student=<personId>&application=<applicationId>`
  opens that application's canonical Journey checklist and document-correction
  workflow. Offers may also retain their existing exact `offer` selection.
  Document submission is not a signature, offer acceptance or activation.
  Configured forms on that same checklist require an authenticated managing
  guardian's explicit signature and registrar approval. Rejected forms require
  correction and a new signature; no generic Complete/waiver control is exposed.
- Staff Student 360: `/staff/students/<personId>?tab=overview|academics|attendance|support|relationships`.
- Unknown or unauthorized targets show an explicit unavailable state instead
  of silently selecting another record. Filters never replace server authorization.

### Intentional exclusions

Do not represent recordings, live-room controls, PDF/image annotation, broad
course authoring, finance/ESA, publisher tools, estimated readiness owners,
fabricated metrics or unsupported tabs as functional merely because the
prototype includes them. Generic guardian Actions without an implemented
decision command remain informational rather than gaining a fake Complete button.
Ask CAN conversations remain person-owned across the page/drawer; opening a
drawer does not claim the current page has automatically scoped a tool query.

## Student, parent, teacher and class participation build

The deeper prototype review identified missing backing capabilities, not just
missing tabs. The following now have canonical persistence and server-side
authorization:

| Previously missing capability | Production implementation |
|---|---|
| Module/lesson reading and durable completion | Published `CourseTemplateVersion.curriculum.learning`; normalized `lesson_progress` keyed by student, section, release and stable lesson ID |
| Syllabus, class resources and private files | Published content contract; HTTPS links or verified, unexpired, standard-sensitivity R2 Documents owned by the exact release, signed for 60 seconds after reauthorization |
| Teacher class/roster workspace | `/classes`, actual section teaching assignment, active roster and student-reported completion, exact student/profile/gradebook links |
| Parent class and assignment detail | Per-child class directory, read-only lesson progress, selected class/assessment, instructions, rubric and released feedback |
| Class announcements | Assigned-teacher posting to canonical section-context communication records, retry-safe request IDs, audit and outbox; current class feed, not an email/push delivery promise |
| Real production discussions | Removed synthetic-only teacher filters, enabled teaching-team responses, enforced active site/program/enrollment/teaching relationships, lock and moderation rules |
| Submission text annotations | Exact persisted text ranges, immutable attempt-bound comments, teacher review composer, student/parent release after grading/return |
| Contextual academic conversations | Shared student/family/teaching-team thread for the exact assessment and student; current authorization rechecked on list/open/reply after relationship changes |

### Navigation and data contract

- `/classes?section=<sectionId>&tab=overview|lessons|files|syllabus|announcements|people`
  is the shared class workspace; `people` is the teacher-only roster.
- Parent class links additionally preserve `student=<studentPersonId>`.
- `tab=lessons&lesson=<stableLessonId>` opens one published lesson.
- Existing student My classes/classwork/grades routes remain supported and link
  prominently into lessons and resources. No registration or authoring behavior
  is moved into the participation workspace.
- Parent assignment detail preserves `student`, `section` and `assessment`.
- Private class Documents use category `class_resource`, subject type
  `course_template_version`, the exact release ID, and storage keys
  `learning/resources/<release UUID>/<object UUID>`. Upload/publishing tooling
  remains outside this participation scope.
- Unconfigured real courses stay explicitly empty. The optional synthetic
  `scripts/seeds/class-participation.sql` fixture extends the existing
  `student-s1-s4` fixture; it is not production course material.

### Schema and acceptance boundary

Deploy `drizzle/0022_stale_sphinx.sql` through the reviewed migration process
before enabling these workspaces against an application database. It creates
`lesson_progress` and `submission_annotations`.

After explicit operator approval, `0022` was applied to the confirmed production
branch on 2026-10-19. Neon management metadata confirmed the project, branch and
endpoint; all 22 existing ledger entries matched local SQL (allowing Windows
line endings) and journal timestamps. The official Drizzle migrator had exactly
one pending migration. Both tables, all five foreign keys, the offset check,
all five indexes and the new ledger hash/timestamp were verified afterward;
a separate connection confirmed persistence. Existing ledger entries were not
rewritten and no production content/fixtures were seeded. Application code
deployment and authenticated browser/storage acceptance are separate gates.

Run `node scripts/run-integration-tests.mjs class-participation --preflight`
and then `node scripts/run-integration-tests.mjs class-participation` with the
existing disposable-test-database safeguards. The test exercises actual Neon
transactions and server commands: student completion to parent/teacher views,
retry idempotency, announcements, production discussions and lock/moderation,
annotation release, parent assignment detail, contextual messages, and revoked
guardian/enrollment access. Fixtures and, when absent, the new migration DDL
are inside one rollback transaction; the test never rewrites the migration
ledger. Existing isolated-branch migration timestamps differ from the local
journal, so this test is not permission to replay or stamp migration history.

Unit/presentation tests additionally cover published-content validation,
resource safety, exact text offsets, role-specific controls, private roster
rendering, unavailable lessons, escaping and exact-child navigation. Real R2
delivery and authenticated browser acceptance still require genuine sessions
and storage configuration.

Governed structured curriculum authoring is now available at
`/operations/curriculum`: owning-organization course creation, syllabus,
ordered modules and reading lessons, HTTPS class resource links, draft cloning
and immutable publication. It requires an explicit institutional publisher
grant; new releases apply to new sections only. The rollback-isolated
`curriculum-authoring` integration mode proves release-to-class delivery and
preserved existing-class progress. Private asset publication and broader
instructional planning remain outside this slice.

Live/replay, broader multimedia course authoring, PDF markup, planner/pathway and
generic family decision workflows remain explicitly deferred. No inert tabs,
fake completion controls or simulated video services were introduced for them.

### Navigation, school support and real profiles

- The authenticated shell now uses a persistent desktop sidebar and a utility
  top bar, with a modal mobile navigation menu. Workspace destinations derive
  from verified memberships, not prototype personas. Existing search,
  notifications, Ask CAN and membership switching remain connected.
- Study-group discovery now applies the same active program/class eligibility
  as opening a group. Selection opens the requested group without burying it
  under the directory; loading, failed/unavailable selections and pending
  membership are explicit.
- Specialists use `/coach`; the distinct counselor role uses `/counselor`.
  Both use `/support` for scoped referral acceptance, routing, support plans,
  scheduled/completed services, review and closure. Caseload outreach and
  referral deep links use canonical records. Clinical/private counseling notes
  are explicitly excluded.
- `/profiles` now reads actual self/relationship-authorized people, not the
  synthetic explorer. Class teaching teams link to those profiles. Existing
  verified photo Documents are signed privately; missing photos show initials.
  Own-profile upload verifies bounded JPEG/PNG objects before persisting a
  Document, audit event and transactional outbox event.
- Removed actual synthetic-only program-preview and calendar-export read
  filters. Program reads now require verified, scoped staff authorization;
  removing a fixture filter must not make real records public. Demo-sign-in,
  write-isolation and document-verification safeguards remain intact.

The expanded rollback integration flow covers non-synthetic group discovery,
membership detail, profile relationships, rejected photo verification,
idempotent photo persistence, counselor referral/service/outreach lifecycle and
out-of-program denials. Storage signing/verification is mocked in that flow;
live R2/CORS delivery remains a separate acceptance gate.

Read-only application checks found four sample class enrollments, two group
memberships, four teacher assignments, no active sample program enrollment, no
accepted sample application, no counselor grant and no profile-photo Documents.
The approved sample repair stopped at the existing audited-operation boundary:
there is no accepted application to activate and no authenticated registrar
session for staff provisioning. No application records were changed. Disposable
fixture definitions now include the missing program enrollment and counselor
membership; they were not executed against the application database.

### Verification boundary

Unit regressions cover enrolled-class selection and loading, exact-record
links, family ordering, profile panels/zero grades, launch requirement math,
calendar filter composition, admissions stage filtering, and teacher response/
attachment authorization. Route inventory, mutation hygiene, TypeScript and
the production build are checked separately.

Static/unit checks do not certify authenticated browser focus/return behavior,
live R2 downloads, persisted domain mutations, or cross-workspace Golden Flow
propagation. Those require genuine authorized sessions and an isolated test
database; do not bypass authentication or use production records to claim them.
