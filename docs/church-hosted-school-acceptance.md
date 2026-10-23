# Church-Hosted School — institutional authority and full-day acceptance

**Status: in development; NOT accepted.** Working branch: `FullFlow`, draft PR #172.
This is an additional operating model, not a substitute for the canonical six-stage K–8 extension FullFlow gate.

## Product boundary

A legally independent church owns its Organization and physical Site. CAN supplies authorized academic
services and (only when supported by verified institutional/legal evidence) acts as the institution
of record and credit issuer. The church's site director supervises the local school day under
specifically delegated, revocable authority. Neither organization owns the other's whole account,
employee directory or private records merely because a Program names the other as a service provider.

- `sites.organization_id` stays the church's Organization.
- `programs.host_organization_id` identifies the host; `academic_provider_organization_id`
  and `credit_issuing_organization_id` may identify CAN as a **distinct** Organization.
- The existing `programs.organization_id` is still the host at creation. That is **not** proof
  that institutional authority has been delegated to CAN. Defining/enforcing school of record
  separately from that host-side scope is a release gate.
- Existing `school_configuration_versions`, `program_responsibility_assignments`,
  `role_assignments`, `delivery_arrangements`, canonical Journey, and audit/event
  infrastructure must be reused.
- A verified agreement, program responsibility assignment, staff access grant and
  accreditation/credit authority evidence are four **different** facts. None implies the others.

## Increment 1 — cross-organization academic-provider intent (committed, unaccepted)

1. The launch wizard retains host Organization/Site choices scoped to the church registrar's
   verified local grants. It presents separately labeled CAN-network academic provider and
   credit issuer choices without exposing unrelated organizations.
2. The launch service resolves the provider and issuer against persisted Organizations and
   rejects a church-hosted cross-org provider that is not a CAN-network Organization, or
   a CAN academic provider with a different credit-issuing Organization.
3. A same-organization church school and non-church high-school extension retain their
   existing launch-selection options.
4. UI copy explicitly disclaims that selection proves contracts, authorization, academic
   legitimacy or staff access.
5. Pure policy tests and a database-backed GF3 integration assertion were added. They are
   **not** counted as passing until actual executions are recorded.

This increment is **selection and intent validation only**. It is not service entitlement,
actual authorization to operate, or automatic accreditation.

## Required connected acceptance (each stage preserves IDs and audit history)

1. **Church requests local CAN site authorization.** Verified church registrar initiates
   request for an existing church-owned Site. CAN sees only the minimal request details.
   Independent CAN approver links externally verified academic-services agreement/evidence,
   specifies CAN academic institution, service scope, effective dates and authorized site.
   Church ownership must not change.
2. **CAN approves and provisions institutional services.** Two-sided approval and effective
   contract become canonical authorization, *not* an account grant. Program/Section creation
   and operations must gate on the actual effective agreement; expiry/revocation denies new
   delegated acts without erasing historical transcripts or audit records.
3. **Local authority delegated.** The independently authorized CAN/school official assigns
   named site director/facilitator responsibilities and explicit site-limited grants.
   CAN's academic registrar/faculty receive only academic service-specific permissions.
   Local leader must not acquire grade finalization, student-wide counseling or transcripts.
4. **Opening readiness proves local supervised school day.** School year, sections,
   teacher/facilitator coverage, onsite schedule, safeguarding lead/deputy, policy/evidence,
   health/incident escalation and local opening receipt must be effective before opening.
   Site safeguarding reporting remains a release blocker.
5. **Family actually applies and enrolls.** Apply/offer/consent/placement for the *same*
   Program and student identity. Guardian consent, legal disclosures and CAN's school-of-record
   responsibilities must be grounded in approved documents/arrangements.
6. **Student attends and learns.** Authenticate site leader/facilitator, student, CAN teacher,
   guardian, and CAN registrar in different sessions. Actual arrival/absence/onsite-day
   evidence, lesson, assignment, submission and teacher grade persist.
7. **School and host reconcile the day.** The site director sees only local attendance,
   staffing, exceptions and permitted contacts. CAN sees its academic and school-of-record
   evidence. Family sees permitted grades/absence resolution. Stable organization/site/
   program/section/student IDs and role-based projections reconcile after reload.

## Next implementation bites

- **Bite 2: Site academic-services authorization.** Add one scoped, versioned relationship
  with request → independent CAN review → approved/denied/revoked lifecycle, explicit
  effective dates and document evidence. No automatic staff/registrar grants; no production
  migration without review. Verify host ownership, CAN identity and second-person approval.
- **Bite 3: Enforce authorization on institutional commands.** Bind the authorized CAN
  provider/issuer and service entitlement to launch/activation, curriculum, academic staff
  and official record workflows. Test expiry, revocation, cross-site and cross-org denial.
- **Bite 4: Responsibility delegation and local operations.** Wire existing school
  configuration/responsibility records to actual roles. Provide the site leader's restricted
  Site Today view and school-day coverage.
- **Bites 5+: Safeguarding readiness, family, instruction, attendance, reconciliation and
  separate-session browser acceptance**, using canonical commands and disposable Neon.

## Nonnegotiable proof

- No seeded `active` Program, agreement, student enrollment, lesson submission, grade or
  site authorization can stand in for the corresponding real command execution.
- Test fixture changes only on a disposable, guarded, migrated Neon branch. No real minors,
  production contract records, production data or implicit access grants.
- Test church/CAN/other-church segregation, expired contract, revoked access, wrong issuer,
  unrelated guardian/teacher, local staff attempting academic commands, and audit/outbox
  persistence. Unit/build/CI success does not equal multi-role runtime acceptance.
- **Release status remains HOLD** until contract/authority security, safeguarding, actual
  onsite operations and connected authenticated browser tests succeed on the same source.
