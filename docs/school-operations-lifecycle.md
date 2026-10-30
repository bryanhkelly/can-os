# School operations lifecycle

The School Launch academic setup now embeds a lifecycle workspace powered by server-side registrar commands.

## Supported workflows

- **Instructor replacement:** swap a teacher in one transaction, validate the incoming teacher's role, and notify the assignee. If the outgoing teacher has held/committed instructional capacity, the operator must reconcile capacity before replacement.
- **Section scheduling:** change schedule templates and start/end dates with a mandatory reason, and prevent schedule changes while capacity remains reserved.
- **Section closure/reopening:** preserve section history instead of deleting records. Closure is blocked by active section enrollments and held/committed capacity.
- **Enrollment exit:** record a withdrawal or transfer outcome with an end date, reason, audit event and domain event.
- **Student section transfer:** move a student to another active section in the same program/term in one transaction, retaining the old enrollment as transferred and creating a linked new enrollment.
- **Waitlists:** keep a student-specific operational waitlist Action attached to a section. The operator can review, close or promote the item into an actual enrollment after checking program membership and capacity.
- **Capacity release:** releasing a committed instructional reservation reconciles the operational teaching roster if the instructor has no other committed assignment for the section.

## Canonical sources

`sections`, `enrollments`, `section_teachers`, `instructional_capacity_reservations`, `actions`, `audit_events`, and `domain_events` remain the system of record. Lifecycle operations do not delete enrollment history.

All changes are authorized using the caller's verified registrar context, organization, site, program and (where scoped) section. Domain events and audits are written transactionally with the mutation.

## Operational limitations

A waitlist is intentionally not an enrollment until promoted. Transferring a student between sections requires both sections to belong to the same program and term; cross-program transfers require admissions/registrar workflows. Schedule changes with committed staffing are blocked pending reallocation rather than silently invalidating the allocation. Academic qualification validation beyond an authorized teacher role is not yet handled by this workflow.

Release of instructional capacity and manual teacher assignment currently share `section_teachers` as operational truth without per-assignment provenance. A future provenance model should distinguish manual assignments from those created by committed capacity.

## Release verification

Run `npm run typecheck` and `npm run build`, then validate end-to-end against a nonproduction database and school persona. The implementation is committed but not certified by a completed build in this session.

## 2026-10-17 operational improvements

- Seat allocations must not exceed the same section demand across instructors. Section transfer and waitlist promotion share a capacity guard requiring open demand and committed seats.
- Section teaching assignments now track `assignment_source` (`manual` or `capacity`). Capacity release only removes capacity-owned assignments and preserves manual appointments. Apply `0018_teacher_assignment_provenance.sql` before using the updated workflow.
- A committed instructor can be replaced with another compatible offering as a single staffing transaction, with role verification, reason, notifications, audit and a domain event.
- Waitlist entry verifies program/year membership; registrars can issue three-day offers, promote students or let overdue offers return to waiting automatically through scheduled maintenance.
- The operations landing page now includes real staffing, demand and waitlist exceptions, separate from synthetic fixtures. Ask CAN can read these exceptions if the actor holds `program.launch.start` in their scoped organizations.
- Section closure cancels unresolved waitlist items; lifecycle snapshots enforce site and section scope.

## Important incomplete areas

- A proper production build/typecheck and migration-generation verification have not been run.
- Academic qualification/compliance beyond verified teacher role is not yet enforced by the replacement orchestrator.
- School-timezone-aware schedule editing, cross-course conflict detection, automatic family offer acceptance/decline, and comprehensive enrollment prereq/credit policy reconciliation are not yet complete.
- The existing migration-history snapshots predate the latest schema migration; reconcile generated Drizzle snapshots and validate against a disposable Neon branch before deploying.
- Do not enable the feature for real student data until privacy, authorization and end-to-end operation are verified.
