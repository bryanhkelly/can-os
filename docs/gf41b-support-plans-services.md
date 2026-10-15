# GF41B synthetic Support Plans and Services

Adds persistent support plans, scheduled tutoring/coaching/learning support/college planning appointments, completed-service outcomes, and review gating to GF41A's referral workflow. Existing Actions metadata stores the plan and service history under reserved synthetic records; no schema migration. Teachers can launch the support referral workflow from the assignment review screen.

## Workflow
Accepted referral → create support plan with goal, intervention and review target → schedule service(s) → record delivery/outcome → progress review → close. A progress review cannot start when planned services are uncompleted.

## Boundaries
This is a synthetic academic/student-success workflow and not a clinical, safeguarding, diagnosis, medical or professional counseling record. Person role switching is for demonstration, without authentication/authorization. Appointment records are stored within the referral Action metadata and do not yet reserve an actual Calendar slot or notify guardians; upcoming work should normalize records for full calendar coordination and cross-Site caseload analytics. The seed data from GF41A remains idempotent.

## Validation
CI typecheck, unit tests and build required before merging. Separate browser and transactional Neon testing must be performed before declaring a full operational release.
