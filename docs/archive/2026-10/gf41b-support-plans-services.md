# GF41B synthetic Support Plans and Services

Adds persistent support plans, scheduled tutoring/coaching/learning support/college planning appointments, completed-service outcomes, and review gating to GF41A's referral workflow. Teachers can launch the support referral workflow from the assignment review screen.

Referral lifecycle state lives in typed tables, not in `actions.metadata`: `support_referrals` (stage, category, requested area, notes, recommendation, reporter), `support_plans`, `support_services` and `support_referral_stage_events` hang off the referral's Action row, which remains the universal work object. Migration `0008_chilly_arclight.sql` creates the tables and backfills existing metadata-based referrals; the seed `scripts/seeds/gf41-support-referrals.sql` inserts matching typed rows.

## Workflow
Accepted referral -> create support plan with goal, intervention and review target -> schedule service(s) -> record delivery/outcome -> progress review -> close. A progress review cannot start when planned services are uncompleted.

## Boundaries
This is a synthetic academic/student-success workflow and not a clinical, safeguarding, diagnosis, medical or professional counseling record. The workflow is gated by `CAN_DEMO_WRITES_ENABLED=true` (fail closed) and requires an authenticated session: teachers create referrals only for students in their own sections; specialists act within their granted sites; every mutation writes an audit event. Specialist assignment is currently site-wide (first active specialist grant); area-level routing waits for area attributes on grants. Appointment records do not yet reserve an actual Calendar slot or notify guardians; upcoming work should add calendar coordination and cross-Site caseload analytics. The seed data from GF41A remains idempotent.

## Validation
CI typecheck, unit tests and build required before merging. Separate browser and transactional Neon testing must be performed before declaring a full operational release.
