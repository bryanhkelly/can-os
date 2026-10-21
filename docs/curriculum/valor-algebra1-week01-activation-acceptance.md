# ValorSchool Algebra I Week 1: activation and acceptance

**Release date:** 2026-10-21 (US Pacific)  
**Environment:** Neon production database branch, **only synthetic organization** `can-synthetic-demo` and synthetic hybrid-program class `CAN-ALG1`.  
**Scope:** 5 structured lessons, 36-week *planning* roadmap, 2 assessments, assigned teacher guide and marketplace course/pack v2. This is **not** a full-year credit-bearing course or an approved examination.

## Activation performed

1. Read and validated the source v1 class, its 1 active synthetic enrollment and teacher, its course progress, its pack entitlement and overlays.
2. Executed gated release commands in transactions, leaving the course and published pack v2 staged while validating content and relationships. Then switched the active synthetic program adoption and the existing class version together with an audit event, rather than creating a second class or login.
3. Confirmed 5 structured lesson IDs (each with at least 5 activities), 36 planned weeks with `creditStatus=not_credit_ready`, 5 restricted teacher-guide lesson mappings, two published scored assessments (20 and 30 points), and a v2 pack with 32 items.
4. Confirmed all 31 other course versions in the pack retained their v1 pointers; the original Algebra I v1 release, original 20-point preview assignment and existing lesson-progress row remain intact.
5. Read and executed `scripts/acceptance/valor-algebra1-week01-readonly.sql` against the target branch. **18 of 18 independent database release checks passed.** The script is safe to rerun without mutating data.

## Transactional student/teacher data rehearsal

Within a database transaction and a **savepoint**, inserted synthetic student submissions for both new assessments. Updated both with a simulated grade and written feedback for the already assigned synthetic teacher, then queried the recorded scores and feedback.

| Check | Observed |
|---|---|
| Two new-assessment submissions stored temporarily | 2 |
| Two graded submissions visible through submission/assessment join | 2 |
| Grades and comments attached to the assigned demo teacher | 2 |
| Savepoint rolled back | Successful |
| Remaining rehearsal-created submissions | **0** |

**Boundary:** The rehearsal validates the *real relational persistence and joins*, not the application server's `saveAssignmentResponse` or `gradeSubmission` HTTP requests. It bypassed those functions deliberately to keep the demo student's assessment records unchanged. Do not call this a fully authenticated browser acceptance test.

## Real class and actor checks

- Class: `/classes?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0&tab=lessons`
- Student demonstration membership: `jordan.student@valorschool.demo`
- Assigned teacher demonstration membership: `riley.teacher@valorschool.demo`
- Class assignment links: `/student/assignments`, `/teacher/gradebook?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0`
- Course pointer: `9558497d-03ab-6330-406c-15bc1398a4e4` (v2)
- Marketplace pack pointer: `1cba8559-6bb3-b3f8-f574-26ba3ab2d82e` (v2)

**Authentication blocker:** `docs/identity-and-demo-access.md` documents `CANOS-LOCAL-TEST` as a development/test-only fixed-code flow, limited to allowlisted `.invalid` accounts. The production-seeded `@valorschool.demo` addresses are not, by themselves, a supported passwordless way to log in as Jordan or Riley. Browser acceptance needs authorized, genuine server-issued sessions for those grants, or a dedicated isolated test deployment. Never enable fixed-code login in production to bypass this gate.\n\nThe deployed routes reuse existing membership authorization. The teacher-guide server endpoint returns guide data only to a currently assigned teacher; the student/guardian responses explicitly return `teacherGuides: null`. Unit, SSR and conditional database integration tests cover these rules in the repository. **An authenticated browser round-trip against the live deployment was not executable from this chat's tools**; the application deployment and actual session login/submit/grade steps remain a separate release acceptance requirement.

### Manual authenticated browser acceptance checklist (outstanding)

- In an authorized **local/test** environment, use the explicitly enabled fixed-code synthetic demo login for an approved `.invalid` demo account. On the shared production deployment, use only a legitimately issued server session bound to the target synthetic account: fixed-code login and demo impersonation are deliberately disabled there. Open Algebra I from the class directory; verify all five lesson titles, structured activities, 36-week roadmap and original `Variables and Equations` progress.
- Open `/student/assignments`; verify the guided problem set and checkpoint, submit representative synthetic written work and confirm acknowledgement and status. Verify the student does **not** receive worked teacher answers.
- Switch to Riley; open Algebra I Teacher guide and check one worked answer, misconception and intervention. Verify Riley can review those two submissions, use rubric scoring and publish written feedback.
- Return to Jordan; check that grades and comments appear in the class assessment-evidence panel. Verify that marked lesson completion does not constitute mastery, attendance or transcript credit.
- As another teacher not assigned to Algebra I, or an unrelated student/guardian, attempt access and confirm denial.
- Record a pass/fail report including actual deployed URL, date, actor session and required corrections.

## Safety and recovery

The earlier attempts to take an additional Neon snapshot were rejected due to the project's snapshot quota. No new snapshot is claimed. The original immutable v1 course, old pack release and previous lesson progress are preserved; a scoped rollback of the **two active pointers** would be possible through a separately reviewed transaction, not through deletion of either course release or the new assessments. Avoid running automatic rollback or touching a nonsynthetic organization.

The separate Admissions Neon acceptance workflow remains blocked and is not evidence for this curriculum release.

## Next bite

Implement **independently versioned, reviewed instructional units** attached to the existing section without reassigning `sections.course_template_version_id`, so future weeks can be added while preserving previous progress and publisher pack adoption. Require explicit teacher/school review before release, and retain separate student and teacher material access controls.
