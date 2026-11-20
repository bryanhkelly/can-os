# Valor School V6.1: Six connected synthetic demo scenarios

**Recorded:** November 20, 2026. **Database:** Neon project `sweet-hall-62441909`, branch `main` (`br-restless-sea-ar9ooo55`), Site `f1000000-0000-4000-8000-000000000003`. All fixture records are fictional.

## Outcome

Six additional requested scenario areas and an operation planning-year reconciliation were added to existing CAN OS tables. No Sections, Cohorts, parallel grading tables, parallel equipment inventories, or parallel survey engines were created.

| Scenario | New record(s) | State and authority boundary |
| --- | --- | --- |
| Family information event | One interest event, one scheduled occurrence, one calendar projection, one synthetic contact RSVP with attended check-in | Past, invitation-only, fictional. Zero outbound event email deliveries; no real family attended |
| Robotics club registration | One season and one Jordan registration, linked to pre-existing Robotics & Design Lab | Season `draft`, registration `pending`, eligibility pending, not rostered, consent null. Guardian and child-safety launch restrictions remain intact |
| Equipment assignment and return | One fictional catalog entry, two fake assets linked to two existing Site devices, one reserved assignment, one historical completed assignment, two append-only custody events | Fake identifiers clearly say DEMO-NOT-REAL. Historical checkout/return are simulated. No real asset serial numbers or custody claim |
| Riley feedback and grading | One proposed canonical `grading_assignments` record for Algebra I | Appointment `proposed`, verified grader capability null. Zero official `grading_decisions` created. Jordan's prior synthetic returned/graded homework examples continue to exist separately as **simulation text and response states**, not official decisions |
| Knowledge check | Twelve `assessment_administrations`, one per existing draft assessment | `draft`, unpublished assessments/forms, no student access grants or assessment attempts. Real publishing requires independent review |
| Student and family surveys | Two `survey_invitations`, one for Jordan and one for Morgan, attached to existing student and guardian draft campaigns | `sent_at=NULL`, no permission evidence, no responses. Authorizations, independent reviews, privacy gates and publication workflow remain required |
| Operation academic years | 2026-2027 and 2027-2028 planning-year records | `planning`; aligned to the two previously existing school-year academic calendars; no new operating accreditation/authorization |

## Load/replay order

1. `scripts/recovery/valor-v61-demo-phase12-family-event-20261120.sql`
2. `scripts/recovery/valor-v61-demo-phase13-club-20261120.sql`
3. `scripts/recovery/valor-v61-demo-phase14-equipment-20261120.sql`
4. `scripts/recovery/valor-v61-demo-phase15-review-assessment-20261120.sql`
5. `scripts/recovery/valor-v61-demo-phase16-survey-preview-20261120.sql`
6. `scripts/recovery/valor-v61-demo-phase17-operation-years-20261120.sql`

Each script has exact Valor synthetic-tenant identity guards, stable deterministic IDs, transactional `DO` blocks and conflict-safe inserts. The device asset links update only the two preexisting, explicitly simulated registrations that have no asset link. The custody history uses a database-generated identity sequence and an append-only event table.

Run against the intended, independently verified Neon branch and schema, never against an unrelated live Site. These fixture scripts are not normal production migrations.

## Verified acceptance on Neon main

`scripts/acceptance/check-valor-v61-extended-scenarios-20261120.sql`: **22 passed, zero failed**.

Regression suites after all six phases:
- `scripts/acceptance/check-valor-v61-full-demo-20261120.sql`: **31/31 passed**.
- `scripts/acceptance/check-valor-v61-student-life-20261120.sql`: **26/26 passed**.

**Total: 79 of 79 database assertions passed**, including preservation of Jordan's nine active Classes, zero official Grade records, zero external event emails, no unauthorized assessment grants, and the absence of submitted responses to draft surveys.

## Required authenticated UI validation

These SQL checks do not verify successful deployment or full interface workflows. Before calling the demo end-to-end operational, verify:

- **Family event:** Alex can view the fictional registration and attendance through the existing Interest Event module. No outbound worker sends.
- **Club:** Jordan or Morgan sees pending status; consent, screenings and extended-learning approval gates block final activation until authorized. The service must not treat a directly seeded pending row as a legally submitted guardian decision.
- **Equipment:** the device management UI resolves the fake asset linked to the existing two Site device records; reservation appears without implying checkout; completed custody history displays separately.
- **Riley feedback:** Riley can review only the permitted student work; the native Class homework module must be integrated with the independent-grader governance path before a canonical `grading_decisions` row can be created. The old teacher gradebook still has Section dependencies and should not be reused to bypass canonical Class rules.
- **Assessments:** draft knowledge checks appear for authorized staff but are not actionable for learners. Independent item/form/version review and student grants must be completed through existing domain services first.
- **Surveys:** authoring/preflight shows the two campaigns and invitations as unsent, without responses. A genuinely interactive survey requires independently approved privacy, safeguarding, accessibility and permission evidence, followed by authorized publication and invitations.
- **Academic calendar:** the operation planning years and existing Site academic calendars agree on dates, without fabricating real school-opening approval.

**Safety:** No synthetic professional approval, actual legal guardian consent, official academic grade, treatment, safeguarding approval or outbound communication has been fabricated. Do not weaken service/database safeguards to make a fixture appear complete.

### Read-only commands

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-full-demo-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-student-life-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-extended-scenarios-20261120.sql
```
