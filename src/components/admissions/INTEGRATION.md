# Admissions and family component integration

The components in this folder are presentation-only. They do not create authorization, identity, enrollment, delivery, or capacity state.

## Launch integration (Agent C)
- Launch's FamilyInviteImporter remains owned by Agent C; do not modify or replace it here.
- Both launch and admissions must call the existing family-invitations backend, with its purpose and authorized program context.
- FamilyInvitationBatchList can render backend-returned batches; provider acceptance is not inbox delivery or verified guardianship.
- No local duplicate-detection result is authoritative. Server-side deduplication and idempotent request IDs remain required.

## Enrollment and guardian integration
- The admissions intake route calls canonical enrollment/admissions functions for inquiry creation, guardian verification, and stage transitions.
- The capacity route calls getAdmissionsCapacity/updateAdmissionsCapacity. UI counts are not permission to reserve seats.
- The family readiness route uses canonical application requirements, offers, active school-year enrollments, and R2 document review.
- FamilyJourneyProgress is read-only. It must be populated from authorized server responses; never store its completion flags as a second checklist.
- Acceptance of an offer is not enrollment activation, student access, class placement, or attendance.
- Guardian access to a student's records requires the independently verified relationship and server-scoped grant. Do not infer access from a shared household, contact email, or accepted application.

## Validation needed before merge
- Run TypeScript compilation and focused tests against this branch.
- Exercise invitation submission/retry, invalid and duplicate contacts, and unauthorized school selection.
- Exercise guardian relationship denial, cross-child access denial, offer acceptance without activation, full-capacity placement rejection, transfer consent denial, and student access approval/revocation.
- Coordinate shared form/mutation primitives with Agents A and B before replacing existing route logic.
