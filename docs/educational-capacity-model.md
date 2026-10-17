# Educational capacity model

CAN separates instructional eligibility from instructional capacity.

- **Qualification/compliance** answers whether a person may teach.
- **Instructor capability** answers what the person can teach.
- **Availability** answers when the person can teach.
- **Capacity offering** answers where/how the capacity can be used and the maximum number of students it can support.
- **Section demand** expresses how many instructional seats a section needs.
- **Reservation** allocates seats from an offering to section demand.

## Canonical flow

1. Record an instructor capability by course template or subject.
2. Record an availability window and optional weekly pattern.
3. Publish one or more capacity offerings scoped to organization/site/program/jurisdiction and modality.
4. A section creates a capacity demand with expected seats and delivery window.
5. Candidate matching requires:
   - matching course template or subject,
   - compatible modality,
   - compatible organization/site/program/jurisdiction scope,
   - an availability window covering the section demand.
6. Remaining seats are derived from open offering capacity minus active, unexpired held/committed reservations.
7. Reservation uses an advisory transaction lock on the offering so concurrent schools cannot oversubscribe the same capacity.
8. A **held** reservation supports planning. A **committed** reservation also creates the canonical `section_teachers` assignment.

## Why seats, not FTE

The network problem is cross-school cohort allocation. A teacher may support 25 students across multiple schools even if no single school can economically employ that teacher. Seats therefore provide a useful allocation primitive:

```
maxSeats - activeReservedSeats = remainingSeats
```

HR/FTE and contract workload can be modeled separately without changing instructional capacity allocation.

## Scope semantics

A null offering scope means no restriction at that level. For example:

- jurisdiction only + live_online = available to compatible programs throughout the jurisdiction;
- site + onsite = capacity usable only at that physical site;
- program = capacity reserved to one program;
- no organization/site/program + live_online = network-wide supply, subject to any jurisdiction restriction.

## Operational truth

Capacity planning does not replace existing academic records.

- `instructional_capacity_reservations` is the allocation/planning truth.
- `section_teachers` remains the operational teaching assignment.
- Committing capacity bridges the two.

This allows Launch Studio and staffing planners to reserve future capacity without prematurely creating operational assignments.
