# Summer and after-school offerings: FullFlow bite 1

## Canonical offering models
- Keep the existing Organization → Site → Program hierarchy with one identity, scoped authorization, event and audit platform.
- `summer_enrichment` remains available for existing noncredit camps and workshops.
- `summer_program` covers summer academic work, either noncredit or explicitly credit-bearing.
- `after_school_enrichment` covers noncredit tutoring, homework support, clubs, STEM, arts and mentoring.
- The program launch command records explicit `programs.metadata.creditMode`. Noncredit programs have a null credit issuer. A credit-bearing program requires a specified credit issuer; the selected issuer still does **not** prove legal authority to issue credits.
- Official transcript data and registrar candidate searches INNER JOIN `creditIssuingOrganizationId`, which excludes noncredit enrichment. Participation certificates and badges are separate from an official transcript; neither is a diploma.
- The registrar launch wizard lists the new types, applies optional presets and conditionally requests a credit issuer.

## No end-to-end readiness claim
This increment supports the **Program definition and launch intent**, not a complete short-course operation. The existing Program Launch Journey and activation require school-year and academic-section setup; they are not bypassed. The existing `activities`, `activity_seasons` and `activity_registrations` implement consent, activity fee obligations, capacity and waitlists, but are not yet wired into a complete program-scoped staff/guardian browser journey.

Recommended next slices, after P0 FullFlow blockers:
1. A noncredit short-course-specific activation/readiness profile, with verified site operator, safeguarding, supervision, staff qualifications, emergency/pickup permissions and capacity. No blanket waiver of school protections.
2. Program-linked seasons and recurring local-time sessions: age eligibility, registration windows, guardian application/consent, roster/waitlist, pickup/drop-off and program attendance, including families not enrolled in CAN full-time.
3. Guardian-facing catalog and registration, staff operations, fee reconciliation, notification pipeline and completion/participation records. Credit-bearing summer courses retain grades, verified credit and academic record policy.
4. Disposable-Neon migration check plus authenticated cross-role browser tests and cross-site negative authorization tests.

## Migration dependency
Migration `0032_extended_program_offerings.sql` follows `0031_learning_activity_tracking.sql`. The previous FullFlow test database was known to be behind GitHub migrations; **do not deploy until migrated and verified on isolated Neon**. This code change does not apply migration 0032 or touch production.
