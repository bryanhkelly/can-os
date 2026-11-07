# CAN OS Academic Delivery and Curriculum

**Status:** Canonical intended teaching/learning model with source ownership references inspected on November 7, 2026. It is **not** a claim that every student-choice feature or cross-role journey has been implemented or released.

## Education promise

CAN delivers a consistent, institutionally governed academic program at many locally supervised church-hosted sites. Its default instruction is **high-quality reusable asynchronous content** produced or curated by qualified educators, with on-demand and scheduled **live support for questions, tutoring, discussion and intervention**. Students should not be required to attend live lectures to access core instruction or to complete a course.

Onsite staff ensure students have a safe place to learn, monitor attendance and supervision, and escalate practical needs. The host Site is not automatically the credit issuer or the employer/assigner of every remote academic presenter. CAN's registrar and academic authority remain explicit.

## Distinct roles that must not be conflated

| Role | Responsibility | Not interchangeable with |
| --- | --- | --- |
| Academic institution / credit issuer | Approved offerings, records, requirements and legal issuance | Local hosting church |
| Curriculum publisher or producer | Master lessons, versioned content, teacher guides, release rights | Section-assigned instructor |
| Organization / Program adopter | License and approve eligible course versions for its Program/year | Publisher copyright ownership |
| Student | Choose eligible course pathway, content presenter or teacher where approved | Unrestricted enrollment, teacher hiring or independent accreditation |
| Responsible academic instructor | Review work, give feedback, intervene, administer outcomes for assigned scope | Publisher of all master recordings |
| Tutor / live support adult | Answer questions, lead optional support and study groups | Mandatory daily live lecturer |
| Room facilitator | Supervise physical students, attendance, schedule and local safeguarding | Automatic gradebook/academic-credential authority |
| Site Admin | Manage local Program setup, space, team and site operation | Institution's publishing and credentialing authority |

## Curriculum ownership and versioning

The **publisher** controls draft content and immutable approved course/pack versions. The **organization and Program** receive rights by verified entitlement, license and adoption, including time applicability. A **Section** pins the approved version actually being delivered. Program adoption does not grant rights to edit the publisher's version, and a new publisher release must not silently overwrite an active Section.

Authorized educators may produce master content under publisher/academic governance. Their recorded lessons, demonstrations and guides are reusable; their permission to publish does not come merely from being assigned to teach a Section. Assigned instructors can add scoped supplements, assessments, discussion tasks and feedback without changing the publisher release.

The Marketplace should distinguish **discover/select/adopt** from **author/publish**. A school's selection of an institutional curriculum offering is not equivalent to choosing individual students' presenters.

## Student choice and the current source gap

Students should be able to choose among eligible approved course options and instructional presenters in the curriculum, while the school enforces prerequisites, capacity, age/Program scope, schedule compatibility and responsibility for grading and support. The choice experience is a **product requirement**.

Current source has a Program-level marketplace (`src/modules/learning/curriculum-marketplace.server.ts`), staff instructor selection (`src/modules/staffing/teacher-marketplace.functions.ts`), and Section-scoped classroom access (`src/modules/learning/class-workspace.functions.ts`). These are **not proof** that a student-facing teacher/presenter choice-and-enrollment workflow already exists. Do not reframe staff assignment as meeting that requirement. Reconcile the model, records, routes, permissions and transfer/midcourse rules before declaring it implemented.

## Asynchronous learning and support

The authorized student classroom must make the next published lesson, recordings, readings, practice, assignments, submission/feedback, notes and progress accessible without a scheduled lecture. Live meetings may exist for questions, study groups, intervention or explicitly optional activities. The repository includes `src/modules/learning/classroom-meetings.functions.ts` to schedule external meetings; **the existence of that code does not make live lessons mandatory in the product model**.

A student's learning-activity event, page dwell estimate, attendance, lesson completion, assessment submission, grade, instructional intervention and progression decision are **different records**. Do not manufacture grade mastery or attendance from video playback or time-on-page. Learning data is privacy-sensitive and limited to authorized academic and guardian relationships.

Learning access and progression must be tested through real authenticated roles and persisted records across refreshes; demo dashboards and fabricated instructional completion do not establish acceptance.

## Onsite academic and operational separation

The church provides facility safety and in-room supervision while students may work on different courses and asynchronous lessons at the same time. Room facilitators require relationship- and schedule-scoped roster, attendance, support and escalation tools. They do not automatically receive gradebook, medical, incident or family-record access outside the approved role.

CAN retains responsibility for academic records and credentialing in the intended CAN school-of-record model, while actual legal operation, safeguarding, course accreditation and jurisdiction-specific requirements require independent institutional verification. Follow [School Operations Security Gates](../school-operations-security-gates.md) and [the Operating Model](OPERATING-MODEL.md).

## Source map

- Approved pack/entitlement/adoption: `src/modules/learning/curriculum-marketplace.server.ts`, `src/db/schema/curriculum-marketplace.ts`
- Academic-year licensing policy: `src/domain/curriculum-year-policy.ts`, `src/db/schema/curriculum-year-adoptions.ts`
- Classroom/lesson reads: `src/modules/learning/class-workspace.functions.ts`
- Optional classroom meetings: `src/modules/learning/classroom-meetings.functions.ts`
- Teacher marketplace/Section capacity: `src/modules/staffing/teacher-marketplace.functions.ts`
- Learning session/interaction events: `src/modules/learning/learning-activity.functions.ts`
- Operational Section/enrollment changes: [School Operations Lifecycle](../school-operations-lifecycle.md)
- Technical curriculum contracts: [Publisher to Classroom Architecture](../curriculum/publisher-organization-classroom-architecture.md)

## Acceptance to execute

1. Publisher/teacher authors a real approved course version; Program adoption checks active license, rights and exact scope.
2. Student discovers eligible courses and presenters and selects them under institutional rules. Record missing user choice functionality as a gap rather than passing an administrative picker.
3. Student watches a published recording and completes authentic practice/assessment without joining a live class.
4. Student requests optional live question support and can continue asynchronous study when no session exists.
5. Teacher/instructor reviews authorized submissions, gives feedback and initiates intervention without sharing private records outside scope.
6. Student learning events, attendance, submissions, grades and progression remain distinct and correctly audited across reload.
7. Site facilitator supervises in-person roster and safety without gaining the teacher's gradebook or protected case permissions.
8. Changing curriculum/Section/teacher preserves history and denies invalid tenant, Program and academic-year transitions.

Each claim needs the exact commit, disposable database, actual commands/browser evidence, identity and denial cases, and a recorded result. All scenarios above remain **unverified in this document**.

## Historical references

- [Curriculum Marketplace architecture snapshot](../archive/2026-11-fullflow/legacy-specifications/curriculum-marketplace-architecture.md)
- [Comprehensive Learning Activity early implementation](../archive/2026-11-fullflow/retired-plans/comprehensive-learning-activity-tracking.md)
- [Connected Learning to Hybrid Site FullFlow plan](../archive/2026-11-fullflow/retired-plans/connected-learning-success-progression-hybrid.md)
- [Annual curriculum adoption agent handoff](../archive/2026-11-fullflow/delivery-evidence/curriculum-annual-adoption-handoff.md)
