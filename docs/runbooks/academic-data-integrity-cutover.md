# Academic data integrity and canonical Class cutover

Release: release-11232026. Database: CAN OS Neon main.

## Operating rules

- Run `scripts/acceptance/academic-integrity-inventory.sql` as a read-only query. The platform administration view uses the same SQL behind its existing platform authorization gate.
- Findings are review signals, not automatically authorized repairs. Counts overlap. Site IDs, not display names, identify scope.
- The Valor deterministic IDs are recovery provenance for that fixture only, not a universal Section-to-Class equivalence rule. Other Sites need independently verified mappings.
- Preserve source records and evidence until the native destination, permissions, assessments, grades, and reporting have been reconciled. No automatic academic credit, guardian consent, or publication decisions.
- A missing student access grant may be intentional for a learner with no direct login; review the intended access model before provisioning. Do not invent accounts or activate pending placements on that basis alone.
- Do not treat a short course, homeroom, or noncredit offering as a full-year academic subject merely to meet a lesson-count threshold.

## Baseline, 2026-11-24

105 active native Class enrollments have matching active attempts. 25 legacy active placements have pending native counterparts at Valor. 13 legacy active placements across six distinct Sites named Main have no matching Valor recovery mapping. All six have unclassified Site lifecycle and no matching verified student grant for those placements. Eight Classes have one to three lessons; twelve have no linked instructional-track presentation records. All 105 active native enrollments are synthetic noncredit demonstrations.

## Remediation sequence

1. Registrar and identity operators classify the six Sites and validate pending placements, intended student/guardian access and current delivery authority.
2. Publisher and reviewers reconcile curriculum scope, lesson source equivalence, instructional asset rights, track version and review evidence. Do not manufacture approval or reuse a video merely because a URL is present.
3. Reconcile learning records using exact source-to-destination evidence. The existing Valor progress recovery script may be repeated only within its synthetic scope. Preserve original dates and reject conflicts.
4. Reconcile assessments, submissions, attendance, grades and reporting across source and destination; establish durable mapping evidence before retiring legacy reads.
5. Verify academic issuer authority, grading and credit policy before changing academic credit behavior.
6. Test authorized learner, guardian, teacher and registrar journeys, including Jordan; test cross-Site denial and legacy-only learners. Run the build, unit tests and authenticated browser acceptance.
7. Only after verified coverage and sign-off, plan removal of superseded services and data retention in a separately authorized migration.

## Acceptance

Re-run the inventory; investigate each unresolved P0 by exact Site and owning workflow. A zero count is not sufficient to certify curriculum quality or migration completeness. Record before/after counts and evidence, and verify no source record was lost or duplicated. The current panel provides live triage and responsible-role labels, not persistent task assignment or approval state. Integrate with the universal work service when that contract exists; do not create a competing approval system.
