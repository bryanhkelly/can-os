# GF41A: Synthetic Student Support Referrals

The /student/support route offers teacher-originated referrals and a specialist triage/caseload preview. Built with the existing Actions table, people, and notifications, without a database migration.

Lifecycle: submitted → accepted → plan_created → in_service → review → closed. Transition guards require sequence and review before closure. Responsibility is assigned to a synthetic academic coach, learning specialist, school counselor, or college advisor. Only an appropriate academic recommendation is shared back to the teacher on review, rather than unrestricted case notes.

Synthetic fixture: scripts/seeds/gf41-support-referrals.sql, with four professional personas and three referrals at distinct stages. Rerunning the seed won't overwrite existing synthetic changes.

Development limitations: fixed demo student; no authenticated role-based access, school-specific safeguarding routing, guardian consent workflow, professional licensure verification, sensitive counseling notes, or automated staff availability matching. Current referral notes are only for fictional academic scenarios, not clinical or medical records. The prototype must not be used for real student information.
