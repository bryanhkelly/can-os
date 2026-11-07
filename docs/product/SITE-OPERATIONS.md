# CAN OS School and Site Operations

**Status:** Canonical lifecycle, supervision and authority contract. Source-inspected on `main` November 7, 2026. This document is **not** operating approval, compliance certification or a completed live school-day acceptance report.

## Two cooperating responsibilities

In CAN's intended church-hosted school model, the Site Admin and authorized local staff run the **physical school day**, while CAN and authorized academic providers govern curriculum, records, grading, registrar decisions and credential issuance where applicable. Actual contracts, law and jurisdictional policy determine the approved split at each Site. The church's operational role does not automatically grant access to unrelated students, academic grades, medical/incident case records or independent CAN governance.

Keep School, Program, Section, student enrollment, staff capacity, physical presence, attendance, pickup/custody and academic progress as **separate canonical facts**. A classroom's attendance, a published website and a completed readiness task are not legal opening authority.

## School lifecycle

1. **Interest and qualification**: identify partner, location, institutional provider/issuer and applicable state rules.
2. **Minimal Site stub**: save school identity/planning context without fabricating academic Programs or facility approval.
3. **Launch preparation**: website, local host/church information, staff and team invitation, family interest, Program/academic setup, facility/safeguarding and compliance evidence.
4. **Opening decision**: independent institutional/legal review, site staffing, emergency coverage and verified physical operating controls. A green Hub card is not a substitute.
5. **Run**: daily learning, physical supervision, attendance, support, safe pickup, incident escalation and communications through owned commands.
6. **Ongoing Settings and Sustain**: staff transfers, schedule and school-year changes, family relationship/record maintenance, publication updates and closure/reopening under their respective permissions.

## Section and registrar operations

The authoritative registrar service in `src/modules/programs/section-lifecycle-service.ts` exposes scoped commands for schedule edits, Section close/reopen, instructor replacement, Enrollment withdrawal/transfer, Section waitlists, seat offers, promotion and expiry. Server wrappers are in `src/modules/programs/section-lifecycle.functions.ts`.

| Change | Required invariant |
| --- | --- |
| Instructor replacement | Verify current/new role and actual offering/scope; reconcile held or committed instructional capacity rather than silently dropping coverage |
| Section schedule | Validate date/time and authorized reason, preserve existing schedule history, and reject/reconcile conflicting staffed capacity |
| Close/reopen | Preserve Section identity/history; block closure conflicting with active students or committed teaching capacity; cancel/reconcile outstanding waitlists explicitly |
| Student exit | Record withdrawn/transferred outcome and reason, preserve historical Enrollment and transactional audit/events |
| Same Program/term Section transfer | Validate source/destination scope and remaining seats, preserve old Enrollment as transferred and link the new assignment |
| Cross-Program move | Use proper registrar/admissions and consent/credit policies; do not represent a same-section transfer as complete |
| Waitlist | A scoped Action is not enrollment; an offer may expire; promotion rechecks Program, academic year, capacity and the current approved recipient/guardian controls |
| Capacity release | Keep manually assigned teachers separate from capacity-owned assignments; releasing a reservation must not remove a manual staff appointment |

The physical and academic systems should **not** duplicate Section, teacher, Enrollment, schedule or capacity truth in view-specific tables. Staffing capacity records remain separate from employee professional qualification and mandatory child-safety clearance. For technical allocation policy see [Educational Capacity](../educational-capacity-model.md), retained as active source-level engineering guidance.

## Daily onsite operation

Local staff need an ordered experience: approved opening readiness → named/on-duty staff and space coverage → expected roster → actual student arrival and presence → scheduled supervised blocks → learning support and adult handoff → custody-authorized pickup → reconciliation and exceptions. Teacher, facilitator, safeguarding lead, parent and registrar must only see the records needed for their verified duties.

Physical presence is **not** inferred from a student's web session or progress. Day review, staff check-in, coverage, room supervision and independent pickup witness information must stay distinct, timestamped and scoped. Authorized child release must follow the current guardian relationship, restrictions/holds and approved site policies; ordinary family notifications must not expose protected custody allegations or internal witness evidence.

An absent or unavailable safety reader cannot become a zero-blocker state. Fail visibly and use an approved non-app emergency or custody process whenever a system is unavailable. See [Site Student Safeguarding](../site-student-safeguarding-and-welfare.md) and [School Operations Security Gates](../school-operations-security-gates.md).

## School-of-record and safeguarding separation

Program academic provider, credit issuer, local host and institutional school-of-record authority are different relationships. A Site Director's local operating assignment cannot override CAN academic publication, credential issuance, legal opening authorization or mandated reporting.

Safeguarding incidents and student support/referral cases require separate, least-privilege intake, escalation, evidence and external-reporting controls. A routine Action, staff message, guardian alert or enrollment note is not an appropriate substitute for restricted safeguarding records.

## Current source pointers

- Registrar/Section lifecycle: `src/modules/programs/section-lifecycle-service.ts` and `src/modules/programs/section-lifecycle.functions.ts`.
- Site preparation and opening: `src/modules/operations/school-opening.server.ts`, `src/modules/operations/school-opening-evidence.server.ts`.
- Onsite preparations, staff arrival, coverage and physical presence: `src/modules/operations/onsite-day-preparation.functions.ts`, `src/modules/operations/onsite-physical-presence.functions.ts`, `src/modules/operations/onsite-supervision.functions.ts`.
- Site roster/day review: `src/modules/operations/onsite-day-review.functions.ts`, `src/modules/attendance/onsite-attendance-workflow.functions.ts`.
- Custody and pickup: `src/modules/operations/pickup.functions.ts`, `src/domain/pickup-custody-review-policy.ts`.
- Capacity and teacher assignments: [Educational Capacity](../educational-capacity-model.md).

These source pointers identify implementation ownership, **not** completed browser, isolated database or legal review.

## Acceptance to execute

Verify authorized opening review separately from website publication. Run one actual school day under separate adult sessions with facility and staffing checks; mark arrivals, room coverage, absences, incidents and safe pickup; exercise interrupted network and unauthorized adult requests. Test student Section transfer, guardian permission, waitlist acceptance/expiry, staff replacement, capacity conflicts and controlled closure. Verify audit events, timezones, cross-Site denial, privacy and refresh consistency. Record the exact SHA/environment and every observed result; **do not copy prior FullFlow passing claims forward**.

## Historical records

- [Former Section Operations Lifecycle implementation log](../archive/2026-11-fullflow/delivery-evidence/school-operations-lifecycle.md) records dated code changes and unresolved tests.
- [Church-Hosted School Day historical acceptance](../church-hosted-school-acceptance.md) remains **active and unreconciled** because it contains safety-critical P0 obligations and scope boundaries. It must not be bulk-archived until these obligations have a verified current replacement.
- [Extended Learning](EXTENDED-LEARNING.md) is separately governed for noncredit seasons and registration.
