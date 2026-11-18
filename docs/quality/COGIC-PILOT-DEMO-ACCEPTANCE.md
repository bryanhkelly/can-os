# COGIC pilot: four observable end-to-end journeys

Status: acceptance **required**; source code is not proof of a deployed, working demonstration.
Use GitHub `main` as the code baseline and Neon `main` as the authoritative production-data baseline. Verify the deployed SHA and database branch explicitly. Never run this acceptance against `test01`.
Synthetic negative-case fixtures belong only in an isolated disposable test environment, not in Neon `main`. Never present synthetic test records as COGIC participation or publish real pilot courses without partner content approval.

## 1. Local Site launch to enrollment publication (deck page 9)
- Begin with a real authorized local Site-admin CAN login; create a Site using `/launch/site`, save the Site interests and render the real private website.
- The new Site is not a published Program. Request Site-to-canonical identity, confirm through the independently authorized canonical Site operator, and approve through an independent CAN reviewer via `/site-identity`.
- In the Site-contextual `/programs/noncredit/enrollment?publicSiteId=<site-uuid>` view, choose only a current authorized canonical deployment with a published training version, approved Offering adoption, registration authorization, Course and completion policy.
- Publish a dated release and verify the Site website correctly exposes the published release only while its enrollment window is open.
- Negative checks: pending/revoked Site links, Site B candidate leakage, stale adoption, wrong Site, false program-interest-to-enrollment conversion and provider-wide release from a Site-scoped entry.
- Evidence: actor roles, approved link, source release ID, exact deployment SHA, real published page and an independently verified adult self-registration.

## 2. Learner watches, checks understanding and sees progress (deck pages 9 and 30)
- Use a real licensed/approved sample recorded lesson; the learner must have an eligible Course attempt and current authorized presenter/track selection.
- Start with the learner's own verified CAN identity, enroll through `/learn/enroll`, enter `/learn/my-courses` and open `/learn/course/<course-attempt-id>`.
- View media using the rights-scoped player, mark lesson progress explicitly, complete the appropriate five-question knowledge check and a personally invited approved survey, then inspect the completion policy's live status.
- Test scores and explicit provider finalization separately. A video heartbeat, pairing, completed lesson, survey, or knowledge-check result cannot become verified attendance, grades, credits or certification by itself.
- Negative checks: wrong learner, expired grant, no media rights, unpublished check/survey, revoked invitation, cross-Course or cross-deployment result leakage and retry/save persistence.
- Evidence: lesson version, presentation asset version, learner attempt, assessment attempt, final result revision, survey response reference, completion decision and a same-learner refresh.

## 3. Four-session local delivery across 15–25 Sites (deck pages 11 and 31–32)
- An operator may batch-publish independently authorized releases to many Sites **within the same operating organization**. This is not national cross-organization delegation.
- Each local authorized facilitator schedules four distinct, nonoverlapping meetings atomically from the approved Site/Course. The dates may run Monday–Thursday in a single week, twice per week (2×2), weekly, or across five or more weeks around holidays. An authorized provider explicitly selects and associates one to four meetings at a time with the exact enrollment release. Validate all scheduled dates and changes in the learner calendar.
- Exercise a facilitator projector session, learner pairing, registered-person roll call (including no-device participants), independently attested attendance and one real approved knowledge check and feedback invitation.
- For each Site and each dated session, reconcile registrations, latest independent room-attendance assertions (including corrections), assessments and governed completion decisions without mixing those measures. Check four-session coverage, and compare the Site cohort view with provider-level totals.
- Completion reporting uses the authoritative supersession chain. A voided completion, ambiguous revision, or truncated history must not appear as a successful completion. Observe Site-level reports and operator-only aggregation, including small-cell disclosure rules.
- Negative checks: unapproved Site, cross-release roster leakage, concurrent booking retry, duplicate or overlapping dates, nonconsecutive/holiday dates wrongly rejected, same Course with different release, conflicting plan attachment and revoked Site authorization.
- **Remaining program scope:** COGIC's independently run churches require approved cross-organization delegation, Site-specific authority and nationally scoped reporting before a true denominational 15–25-Site rollup is accepted.

## 4. Site readiness and device/internet needs (deck pages 20 and 31–32)
- Qualification and questionnaire definitions must remain versioned, reusable and data-configured. Do not encode the proposed questionnaire's 20 questions into a page.
- A current authorized Site qualification assessment can record required and available equipment or connectivity quantities, optional per-unit budget and an observed shortfall. `/canonical/lab/site-qualification` displays only reported status until independent verification.
- For each participating Site capture facilities, internet capacity, usable learner devices, staffing/safeguarding and documentation as distinct, reviewable evidence. Device inventory and qualification-resource needs are different records and must not be conflated.
- Negative checks: unattached resource need, another Site's assessment, unauthorized registrar, duplicate assessment/resource codes, withdrawn qualification application, missing evidence, false verified status and a Site that has no approved assessment.
- **Remaining program scope:** questionnaire-to-application submission, dynamic evidence linking, verified resource reviews and a publication-safe network-wide digital access needs report are not yet accepted.

## Release gate
- [ ] CI build, typecheck, relevant unit tests and migrations pass at one exact SHA
- [ ] Confirm authenticated browser release is the inspected `main` commit and connects to Neon `main`
- [ ] Verify Site-scope denial and role transitions with disposable fixtures, without polluting production records
- [ ] Separate real accounts for Site admin, CAN reviewer, facilitator and adult learner
- [ ] Live signed-in browser journey for each step, including refresh and negative scenarios
- [ ] Site-level figures reconcile to enrollment, attendance, assessment and final decision records
- [ ] COGIC partner content, program authority, safety/privacy language and reporting delegation approved
- [ ] No production demonstration claims until deployed SHA, runtime credentials, DNS and database environment match

## Implementation ownership
- Site start: `src/components/launch-studio/SiteFirstLaunch.tsx`
- Site-context enrollment: `src/routes/programs.noncredit.enrollment.tsx`
- Flexible four-session schedule: `src/modules/learning/classroom-scheduling.functions.ts`
- Cohort assignment: `src/modules/enrollment/noncredit-cohort-operations.functions.ts`
- Learner course: `src/components/learning/NoncreditCourseActivities.tsx`
- Resource need entry: `src/modules/operations/canonical-qualification-lab.functions.ts`
