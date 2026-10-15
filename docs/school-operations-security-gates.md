# School Operations Security Gates

These are **merge/release blockers**, not optional polish. Schema generation and TypeScript CI do not prove safe handling of student medical, legal, or family data.

## Authorization
- Resolve actor/capabilities/scope from verified server-side identity, not caller-supplied CommandContext.
- Require explicit Site, student relationship and role authorization for health reads/writes and medication authorization.
- Prove denied access across Sites, students, former staff, revoked grants, and expired grants.
- Never use an empty scope list as a universal authorization grant.
- Enforce document classification and field-level filtering in query services, not just frontend components.

## GF33 Field Trips
- Filter Trip Safety Packet to ONLY grant.allowedFields and rostered, consented students.
- Verify chaperone designation, required clearance and supervised student roster.
- Implement encrypted offline storage, revocation synchronization, short-lived access, and device wipe/expiry behavior. Database grant expiry alone does NOT erase offline copies.
- Check trip/participant/incident Site ownership on every mutation.
- Validate guardian authority for the particular student and Household.
- Add explicit payment/fee eligibility gate and record paid state via provider receipts.

## GF34 Health
- Require medical-tier role and relationship checks for all health and medication commands.
- Enforce current authorization and appropriate staff credentials/site assignment before administration.
- Support corrections to administration via append-only records, never mutation of the original medical fact.
- Handle jurisdiction-specific immunization requirements, exceptions, and retention rules with qualified review.

## GF35 Incidents
- Define mandatory severity-driven reviews, parental/network/regulatory notification policies, and closure gates by Jurisdiction.
- Do not permit closure merely because zero reviews are pending.
- Sensitive incident reads must be audited and access checked by relationship, Site and classification.
- Preserve evidence integrity/version provenance, amendment history, retention, legal hold and export.
- Add denial/exception tests and escalation/deadline monitoring.

## GF36 Athletics
- Resolve academic eligibility with official, versioned rules; check physical expiration and forms BEFORE roster activation.
- Ensure fee/consent/eligibility status independently governs participation.
- Re-evaluate after grade/disciplinary/physical changes.

## GF39 Conferences
- Make slot reservation atomically conditional, with graceful conflict handling and booking cancellation/rebooking lifecycle.
- Validate teacher/section linkage and prevent cross-Site leakage.
- Authorize notes by visibility for student/guardian/staff readers.
- Implement queued reminders as actual idempotent delivery workflows.

## Quality gates
- Integrate GF33–GF39 against a real isolated Neon branch with fixture data and negative access tests.
- Validate migrations against existing production schema; do not copy synthetic or personal student records.
- Verify RLS/DB boundaries where needed, verify production secrets are not logged, and obtain a privacy/security review before production deployment.
