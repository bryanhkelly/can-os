# COGIC pilot: four observable end-to-end journeys

Status: acceptance **required**; source code is not proof of a deployed, working demonstration.
Use an isolated `test01`-backed application preview at an exact matching GitHub commit.
Never present synthetic test records as COGIC participation or publish real pilot courses without partner content approval.

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

## 3. Four-week local delivery across 15–25 Sites (deck pages 11 and 31–32)
- An operator may batch-publish independently authorized releases to many Sites **within the same operating organization**. This is not national cross-organization delegation.
- Each local authorized facilitator schedules four weekly classroom meetings atomically from the approved Site/Course. An authorized provider then associates four meetings atomically to the exact enrollment release. Validate scheduled dates in the learner calendar.
- Exercise a facilitator projector session, learner pairing, registered-person roll call (including no-device participants), independently attested attendance and one real approved knowledge check and feedback invitation.
- For each Site, reconcile registered, physically verified, assessed and completed learners without mixing those measures. Observe Site-level reports and operator-only aggregation, including small-cell disclosure rules.
- Negative checks: unapproved Site, cross-release roster leakage, concurrent booking retry, duplicate schedule requests, same Course with different release, conflicting plan attachment and revoked Site authorization.
- **Remaining program scope:** COGIC's independently run churches require approved cross-organization delegation, Site-specific authority and nationally scoped reporting before a true denominational 15–25-Site rollup is accepted.

## 4. Site readiness and device/internet needs (deck pages 20 and 31–32)
- Qualification and questionnaire definitions must remain versioned, reusable and data-configured. Do not encode the proposed questionnaire's 20 questions into a page.
- A current authorized Site qualification assessment can record required and available equipment or connectivity quantities, optional per-unit budget and an observed shortfall. `/canonical/lab/site-qualification` displays only reported status until independent verification.
- For each participating Site capture facilities, internet capacity, usable learner devices, staffing/safeguarding and documentation as distinct, reviewable evidence. Device inventory and qualification-resource needs are different records and must not be conflated.
- Negative checks: unattached resource need, another Site's assessment, unauthorized registrar, duplicate assessment/resource codes, withdrawn qualification application, missing evidence, false verified status and a Site that has no approved assessment.
- **Remaining program scope:** questionnaire-to-application submission, dynamic evidence linking, verified resource reviews and a publication-safe network-wide digital access needs report are not yet accepted.

## Release gate
- [ ] CI build, typecheck, relevant unit tests and migrations pass at one exact SHA
- [ ] Test01 backend role permissions and read/write transactions verified
- [ ] Separate real accounts for Site admin, CAN reviewer, facilitator and adult learner
- [ ] Live signed-in browser journey for each step, including refresh and negative scenarios
- [ ] Site-level figures reconcile to enrollment, attendance, assessment and final decision records
- [ ] COGIC partner content, program authority, safety/privacy language and reporting delegation approved
- [ ] No production demonstration claims until deployed SHA, runtime credentials, DNS and database environment match

## Implementation ownership
- Site start: `src/components/launch-studio/SiteFirstLaunch.tsx`
- Site-context enrollment: `src/routes/programs.noncredit.enrollment.tsx`
- Four-week schedule: `src/modules/learning/classroom-scheduling.functions.ts`
- Cohort assignment: `src/modules/enrollment/noncredit-cohort-operations.functions.ts`
- Learner course: `src/components/learning/NoncreditCourseActivities.tsx`
- Resource need entry: `src/modules/operations/canonical-qualification-lab.functions.ts`
