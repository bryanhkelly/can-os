# Valor School V6.1: synthetic safety and student-life fixture

**Scope:** Neon project `sweet-hall-62441909`, `main` (`br-restless-sea-ar9ooo55`), fictional Valor Site `f1000000-0000-4000-8000-000000000003`. Load verified November 20, 2026.

## Applied canonical demo fixtures

| Domain | Verified records | Provenance / boundary |
| --- | ---: | --- |
| Study groups | 7 | All `section_id=NULL` and all have an existing canonical Class ID in metadata; no new Section/Cohort |
| Study group memberships | 10 | Includes pending and approved synthetic memberships; **not independent proof of guardian consent** |
| Study group posts / sessions / reports | 10 / 7 / 3 | Includes a hidden moderation example and future demo RSVP |
| Field trips | 5 total | 2 older historical simulated approvals plus 3 new **proposed**, not departure-ready |
| New trip invitations | 8 | All `invited`, none has consent evidence, chaperone authorization or boarding |
| Synthetic restricted health profiles | 3 new | Fictional medical-tier examples; no diagnoses or clinical authority |
| Health compliance / fictional desk visits | 3 / 2 | Missing/pending/expired status, no verified documents or treatment |
| Closed synthetic incident exercises | 2 | Both explicitly fictional and closed, no live safeguarding intake |
| Canonical Class discussions / messages | 4 / 12 | Four Class-context threads with Jordan/Riley participation; internal only, no delivery |
| Real-world safeguarding appointments / approved policies | 0 | Not manufactured for demo |

**Original course data:** Jordan's nine active canonical Class enrollments and Course Attempts are unchanged. The earlier academic demo read-only suite still passes 31/31, and the student-life suite passes 26/26, or 57/57 database assertions combined.

## Load order and idempotence

- `scripts/recovery/valor-v61-full-demo-phase8-groups-20261120.sql`: preserve earlier groups, migrate two legacy Section FKs to metadata and add Biology Study Lab, Photography Club and Spanish Conversation Group with approval, posts, sessions and moderation examples.
- `scripts/recovery/valor-v61-full-demo-phase8b-existing-group-class-links-20261120.sql`: connect remaining Algebra II Study Circle and Creative Writing Collective to canonical Classes in metadata.
- `scripts/recovery/valor-v61-full-demo-phase9-trips-20261120.sql`: create three safe, proposed fictional trips and invite eight existing synthetic learners. **After creation, the permission template was removed from all three proposals** to prevent any accidental signable policy state. Current source SQL no longer creates a signable permission document.
- `scripts/recovery/valor-v61-full-demo-phase10-health-safety-20261120.sql`: three restricted fictional health-profile examples, compliance status, two administrative desk visits and two closed training incidents, no medical authorization, treatment or dispatch.
- `scripts/recovery/valor-v61-full-demo-phase11-class-discussions-20261120.sql`: four canonical Class-context teacher/student discussion threads and 12 fictional message records.

All records have stable IDs, exact synthetic-tenant guards, and transactionally guarded inserts/updates. Existing real-world data is never used for content or identity.

## Acceptance

The read-only validation file is `scripts/acceptance/check-valor-v61-student-life-20261120.sql`.

**Result:** 26 of 26 checks passed, zero failed on Neon main. It checks Class link consistency; absence of legacy Section foreign keys; group membership/session/posts; non-signable proposed trip permissions; absence of approvals, chaperone assignments, consents and attendance for new trips; restricted health records; absence of medication authorizations; closed simulated incidents; absence of fabricated safeguarding appointments; exact Class-bound message counts; and preservation of Jordan's nine active Classes.

## Boundaries and follow-up engineering

1. **Study-group readers/writers still reference legacy Section and Program enrollment context.** The existing data is now Class-linked, but database linkage does not prove the UI respects canonical Class eligibility. Update the existing study-group services and authorization predicates to use `classes`, `class_enrollments` and canonical staff assignments before removing the old source tables. Keep approval/guardian gates intact.
2. **Legacy course discussion UI still queries Section-context threads.** The new Class threads use `communication_threads.context_type='class'` and canonical Class IDs. Add exact learner/teacher Class entitlement checks before exposing them, including defense against cross-Site or unapproved students. Reuse canonical communication components, not a parallel chat system.
3. **The two older, historical simulated trips display `approved` with no chaperones.** They must not be interpreted as departure-ready. The three new trips are `proposed`, have no signable permission text, no qualified chaperones and no attendance.
4. **Safety and medical workflows must fail closed.** Do not issue production safeguards, real emergency dispatch, medical care, legally significant guardian consent, medication orders, or professional credentials using synthetic records. Run any real-time high-severity escalation tests only in an isolated environment with all external notifications suppressed.
5. **Future full-flow QA:** verify Jordan sees only his Classes and permitted discussions; Riley can moderate only his assigned Classes; Morgan only sees the linked student's authorized records; field-trip departure and guardian signing fail without evidence; medical records remain inaccessible to standard Class users.
6. **Deployment:** The database acceptance results do not imply the latest GitHub `main` has successfully built and deployed or that authenticated browser interactions have passed. Verify build, TypeScript, Class architecture tests, canonical-study-group behavior and end-to-end playback/chat/moderation separately.

## Run read-only checks

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-full-demo-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-student-life-20261120.sql
```
