# CAN OS Launch Studio: School, Family, Student, and Staff

**Status:** Canonical multi-audience onboarding and navigation contract, source-inspected on `main` November 7, 2026. Route and function presence does **not** establish complete cross-role browser or database acceptance.

## One experience, four separate journeys

Launch Studio should make each person feel guided into a functioning school community, not dropped into an administrative configuration product. The current entry component `src/components/launch-studio/LaunchStudioEntry.tsx` exposes four pathways:

| Audience | Canonical entry | Owner and outcome |
| --- | --- | --- |
| School operator | `/launch/hub/school` | Minimal Site profile → school Launch Hub → independent opening requirements → Run |
| Parent / guardian | `/launch/family` | Verified family context, student application and requested documents, explicit submission |
| Student | `/launch/student` | Student's actual profile, approved course choices and next learning step |
| Teacher / staff | `/launch/staff` | Personal preparation and separately submitted qualification evidence |

All journeys share visual tokens, responsive controls, orientation/help and accessible progression using `src/components/launch-studio/LaunchStudioShell.tsx`. Their **canonical domain commands and permissions remain separate**. An entry card, a saved draft or an onboarding checklist does not grant school access.

## School operator path

Create and save a canonical minimal Site stub without fabricating a Program, website publication, academic enrollment or opening approval. Then use the [School Launch and Run](LAUNCH-AND-RUN.md) nine-module Hub for profile, site information, Website Studio, team, promotion, recruitment, events, academics and compliance. The formerly proposed giant six-stage wizard is not the required first-use experience. An operating Site's setup belongs in Run → Settings.

School Site Admin is the final local authority for Site-owned configuration and website content, within CAN institutional, regulatory, safeguarding and verified relationship constraints. A Site's creation, Program activation, content publication and legal opening approval are separate events.

## Family path

`src/routes/launch.family.tsx` currently composes Welcome, Student application, Forms & documents, and What's next. Use the authorized guardian/application reader and ordinary admissions commands. A family draft is incomplete private form data; it is not a submitted Application, proof of verified guardianship, accepted transfer consent, published tuition agreement or enrollment.

Application completion should reveal the actual next tasks and school-provided document requirements from the canonical Program and household. Never infer a matching child from an email or restore a previously submitted application as a new submission. Keep existing-person and sibling reuse/relationship verification explicit.

## Student path

`src/routes/launch.student.tsx` currently composes Welcome, Your profile, Course choices and What's next, using actual profile and course-registration readers. Do not fabricate classes, schedules, mastery, or a teacher assignment. The longer-term student choice of approved curriculum and recorded presenters is defined in [Academic Delivery](ACADEMIC-DELIVERY.md); a school staff marketplace is **not** student teacher selection.

Student profile save and course-choice requests are independent commands and must retain their separate dirty/confirmation state. A stale draft profile baseline must require explicit reconciliation rather than overwriting newer records.

## Staff path

`src/routes/launch.staff.tsx` currently composes Welcome, Your details, Qualifications and What's next. A staff draft stores preparation notes, **not** credential approval, proof of required background clearance or uploaded evidence. Qualification submission must use its own protected service, role grants and independent reviewer decisions. Missing qualifications and pending evidence must remain clearly visible.

## Draft, navigation and integrity rules

- Use the shared server functions in `src/modules/programs/launch-drafts.functions.ts`, scoped by authenticated account, grant, audience and exact context; do not create a parallel localStorage workflow record.
- A draft save preserves a private buffer and optimistic revision; it does **not** write final school/application/profile/qualification data or set approval status.
- Saved inputs, selected files, unresolved mutations and dirty forms must receive context-appropriate unsaved-change protection on exit, Back and switching audience or school. Do not lie that a draft captured independently uploaded files.
- Actual entity edits require their own save/submission controls. The draft's acknowledged revision must not clobber edits made during an in-flight save.
- A student or guardian must not silently switch to another child, Program or school because a saved context is unavailable.
- A school Journey or operating dashboard uses authoritative read models. Optional loader failure is **Unavailable**, not an invented empty or ready state.
- Shared UI and step navigation do not create shared authorization: separate family, student, staff and Site scopes remain enforced on the server.

## Source map

- Entry: `src/components/launch-studio/LaunchStudioEntry.tsx`
- Shared presentation: `src/components/launch-studio/LaunchStudioShell.tsx`, `src/components/launch-studio/useLaunchUnsavedChanges.ts`
- Family: `src/routes/launch.family.tsx` and canonical guardian application commands
- Student: `src/routes/launch.student.tsx` and course registration/profile services
- Staff: `src/routes/launch.staff.tsx` and qualification services
- School: `src/routes/launch.hub.school.tsx`, `src/components/launch-studio/SchoolLaunchHub.tsx`
- Private drafts: `src/modules/programs/launch-drafts.functions.ts`, `src/domain/launch-draft.ts`

## Acceptance to execute

With real server-issued and different-role test accounts on a disposable database, exercise all four entry paths, valid/invalid context and invitation tokens, incomplete draft save/reload, concurrent revisions, role switching, actual submission, document uploads, denied cross-persona access, browser Back, responsive navigation and explicit transition into Run. Test an existing guardian with multiple children, an existing school with multiple Programs, a student with courses, and staff qualification review. Attach exact commit and observed evidence; this document **does not claim any end-to-end pass**.

## Historical source

The dated multi-audience launch implementation notes and historical six-stage planning sketches are preserved in [School Launch Studio and Site Workspace history](../archive/2026-11-fullflow/legacy-specifications/school-launch-studio-site-workspace.md). Refer to them for provenance, not current route or release authority.
