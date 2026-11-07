# Church-Hosted School: Opening, Safeguarding, and School-Day Release Gates

**Status: mandatory acceptance contract; NOT a school-opening certificate.** This document consolidates release-blocking requirements without removing the detailed operational/safeguarding source contracts. Source ownership was inspected on `main` on November 7, 2026. A function, migration, screen, configured flag or dated FullFlow result is not evidence of legal compliance or authenticated operational acceptance.

## Authority: a local host is not the academic institution

The church owns the local physical Site and is responsible for approved physical supervision and its delegated local operating duties. CAN or a separately authorized institution governs the academic Program and may serve as school of record and credit issuer **only where effective legal, institutional and jurisdiction-specific evidence supports that relationship**.

Host Organization, academic provider, credit issuer, Program, Site, institutional-services agreement, local staff grant, opening authorization and student enrollment are **distinct facts**. A site director's local assignment must not become cross-Organization registrar, transcript, grade-finalization, network or safeguarding case-browsing authority.

For every real school, independently verify effective contracts, current Program/Site configuration, actual institutional grants, permitted staff identities and applicable legal authority. Expiration, suspension or revocation must block new protected activity without erasing historical records or preventing urgent child-safety response.

## Non-negotiable release gates

| Gate | What must be proven | Separate evidence or negative scenario |
| --- | --- | --- |
| **SAFE-01: institutional authorization** | Exact church Site, responsible CAN/academic institution, Program scope, approved bilateral service arrangement and effective dates | Wrong host, wrong CAN institution, withdrawn contract, revoked staff grant and wrong issuer denied without deleting history |
| **SAFE-02: jurisdiction and opening approval** | Current qualified state/jurisdiction profile, exact school configuration version, verified operating/credential authority and independent institutional opening decision | Old jurisdiction fingerprint, changed configuration, suspended school and approval by uploader or unqualified approver denied |
| **SAFE-03: five independent opening documents** | The current, appropriately scoped and in-term versions of legal/jurisdiction authority, facility approval, safeguarding/mandated-reporting procedure, emergency response, and pickup/custody procedure | New pending, rejected, expired, withdrawn, wrongly scoped or replaced evidence cannot fall back to an old approved version |
| **SAFE-04: named adults and real coverage** | Active Site and Section delegation for a primary adult and distinct qualified backup, evidence of screening/training, reviewed room plan, approved site-local period and capacity | Mere teacher assignment, staff eligibility, click-to-accept duty or signed room plan cannot count as physical presence or continuous two-adult coverage |
| **SAFE-05: physical arrival and day reconciliation** | Independently witnessed arrival and actual roster/attendance, expected versus present students, duty response, room supervision, absences, departures and closed exceptions | Wrong-day arrival, stale acknowledgement, staff substitution, interrupted connectivity and partial/read failures fail visibly |
| **SAFE-06: custody and pickup** | Current guardian and pickup authority; restrictions/holds; independently witnessed release, safe denial and uncollected-child response | Disputed custody cannot be resolved by a single requester; implicated/restricted guardian never automatically receives protected case information |
| **SAFE-07: safeguarding concern intake and escalation** | Any approved first-observer role can report a concern directly; on-duty named responder/deputy/CAN fallback, bounded handoff, independent outside reporting and approved non-app procedures exist | Wrong-site cases, absent responders, revoked grants, delayed acknowledgment, confidential detail leakage and outage pathways tested |
| **SAFE-08: sensitive support separation** | Safeguarding allegations, external reports, custody evidence, counseling and routine student support have separately scoped readers, retention, exports and notifications | Academic Actions, guardian portals, messages and AI summaries never receive confidential allegations or private external-report details |
| **SAFE-09: legal and real-world acceptance** | State-specific counsel/policy review, trained adults, actual drills/operational playbook, isolated multi-role browser and database tests and independent operating decision | No school may be represented as open merely because the UI says Complete, CI passed, a fixture exists or a school website is published |

### Five canonical opening document categories

The current source catalog in `src/domain/school-opening-evidence.ts` defines these exact keys:

- `school_opening_jurisdiction_authority` — legal and jurisdiction opening authority.
- `school_opening_facility_approval` — facility approval.
- `school_opening_safeguarding_reporting_procedure` — safeguarding and mandated-reporting procedure.
- `school_opening_emergency_response` — emergency response procedure.
- `school_opening_authorized_pickup` — authorized pickup and custody procedure.

The server is responsible for checking subject scope, reviewer independence, version, status, expiry, configuration and jurisdiction at decision time. The current evidence service includes an environment gate `CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED=true`; a configured upload feature does **not** establish full storage, malware scanning, privacy, legally qualified review or operational acceptance.

## Physical presence cannot be inferred from planning

A named Site staff grant, Section facilitator delegation, qualification record, verified room plan, compatible timetable and positive duty response establish **planned** coverage only. Actual coverage requires separately observed adult check-in, independent witnessing where prescribed, current approved opening, no blocking duty changes, and ongoing physical supervision. The original source in `src/domain/onsite-supervision-coverage.ts` explicitly describes planned staffing as not proof of arrival.

Use current commands and records in `src/modules/operations/onsite-physical-presence.functions.ts`, `src/modules/operations/onsite-day-review.functions.ts`, `src/modules/operations/onsite-supervision.functions.ts`, `src/modules/attendance/onsite-attendance-workflow.functions.ts` and related room/duty services. A stale staffing/room fingerprint must never remain green after a changed appointment or room. Student web activity must not stand in for physical attendance.

The source contains reviewed school-opening commands and custody operations, but these do not certify that the real host has valid clearances, inspection, emergency policies, safe pickup arrangements or continuous supervision. Each is an independent human/legal operational decision.

## Safeguarding reporting: not an ordinary Action or a help-desk ticket

An onsite facilitator, Site staff member, Site leader or paraeducator may be the first adult who observes or hears a serious concern. First observers need a **submit-only, exact-Site permission**; they should not receive broad incident, counseling, registrar or cross-site case access. `src/domain/site-safeguarding-access.ts` restricts these reporter grants, while `src/domain/safeguarding-case-access.ts` governs separately assigned case readers.

The intake contract in `src/domain/safeguarding-intake-policy.ts` records factual observations, immediate danger and source uncertainty. It must not automatically make a clinical, criminal or abuse finding, assume a guardian is safe to notify, or claim an outside agency has been contacted.

For suspected immediate danger, a human seeks emergency assistance. Where law imposes a duty on an individual reporter to contact an outside agency, **that duty cannot be delayed or replaced by internal routing, supervisor approval or software availability**. Legal reporting rules, thresholds, recipients and timing must be reviewed for each operating jurisdiction. The system must supply clear offline/non-app instructions and trained human response when unavailable.

The current safeguarding service at `src/modules/safeguarding/safeguarding-service.ts` contains restricted intake, response, escalation, evidence and external-report commands; `src/modules/safeguarding/safeguarding-overdue.server.ts` contains an overdue handoff processor. The existence of a processor does **not** prove scheduler deployment, successful delivery, human acknowledgment or that an outside report was completed. Independently record attempted, submitted and agency-acknowledged outcomes when known. No automatic guardian broadcast of allegation details.

### Keep ordinary support cases separate

Academic intervention, tutoring, accessibility support and counseling have legitimate coordinated workflows, but the private safeguarding narrative, witness evidence, external reporting receipt, custody allegations and other sensitive material must not be copied into normal student-support referrals, classroom notes, general Actions, notifications or family summaries. Permit only independently reviewed minimum-necessary task summaries and explicit role-scoped access.

See [Site Student Safeguarding and Welfare](../site-student-safeguarding-and-welfare.md) and [Multidisciplinary Student Support Cases](../multidisciplinary-student-support-cases.md). Both remain active contracts pending detailed reconciliation; their dated FullFlow implementation statements are **not current acceptance evidence**.

## Custody and family privacy

Pickup authorization, guardian relationship, custody hold, approval to release and witnessed handoff are distinct events. `src/modules/operations/pickup.functions.ts` includes guardian authorization, custody hold/resolve, verified release, denial and uncollected-child operations; `src/domain/pickup-custody-review-policy.ts` requires a separate proposer and reviewer for protected hold resolution. This policy check does not verify the legal authenticity of a court order by itself.

Human reviewers must establish current guardian/custody authority under applicable law and school policy. Uncollected minors, disputed custody and emergency holds require approved emergency and escalation procedures. Do not send details to a guardian who may be implicated or unauthorized. Do not infer a cleared hold from expired evidence or a clicked UI action.

## Test plan: actual people, same school and same day

Before representing a church-hosted school as operationally accepted, run one end-to-end, same-identity journey on a disposable database with distinct server-issued sessions: church initiator, CAN agreement approver, CAN academic registrar/faculty, Site Admin, Site Director, primary adult, backup adult, independent witness, guardian and student. Verify:

1. Bilateral agreement and institutional/site authority, then approval of each exact school-opening evidence category.
2. Current jurisdiction, legal authority, safeguarding roster and opening decision; refuse all missing/expired/changed states.
3. Student Application → verified offer/consent → Enrollment → Section and legitimate academic records without shadow household or Program records.
4. Scheduled coverage, actual adult arrivals and witnessing, student arrival, ongoing supervision, planned room and exception reconciliation.
5. Lesson participation, assignment, grading, Guardian and CAN view with only appropriate academic information and stable IDs.
6. Guardian-approved pickup, denied unauthorized pickup, disputed custody, incident response, uncollected child and no-leak notifications.
7. Immediate safety intake, own-receipt-only reporter view, correct restricted responder handoff, overdue escalation, external-report recording and offline procedures.
8. Wrong-Site, revoked staff, expired agreement, wrong Program, false claim, failed storage, failed notifier, stale revision, race/retry and evidence withdrawal scenarios.
9. Post-suspension child-safety reporting and necessary historical reads continue while new academic/operational authorizations fail closed.

Record exact Git SHA, actual command/browser outputs, DB branch, Site/Program IDs, reviewer identity, state policy version, denied cases, failures, exclusions and responsible legal approval. School operations, production deployment, real student data, and DNS or migration changes require their own explicit approvals.

## Current source ownership / evidence limit

| Source area | Code pointers | What it does not prove |
| --- | --- | --- |
| Opening evidence / current decision | `src/modules/operations/school-opening.server.ts`, `src/modules/operations/school-opening-evidence.server.ts`, `src/domain/school-opening-jurisdiction-guard.ts` | Legal authorization or approved deployment |
| Safeguarding restriction and workflow | `src/modules/safeguarding/safeguarding-service.ts`, `src/modules/safeguarding/safeguarding.functions.ts`, `src/domain/safeguarding-case-access.ts` | Statutory outside reporting, 24/7 duty coverage or safe runtime |
| Staff coverage and day review | `src/domain/onsite-supervision-coverage.ts`, `src/modules/operations/onsite-day-review.functions.ts` | Continuous physical supervision |
| Custody and pickup | `src/modules/operations/pickup.functions.ts`, `src/domain/pickup-custody-review-policy.ts` | Valid court documents, custody clearance or real-world child handoff |
| Release blockers | [School Operations Security Gates](../school-operations-security-gates.md), [Acceptance Standards](ACCEPTANCE-STANDARDS.md) | Any gate already executed and passed |

## Preserve, do not silently retire, these supporting contracts

- [Church-Hosted School Acceptance](../church-hosted-school-acceptance.md): detailed 628-line historical incremental specification containing safety-critical still-applicable requirements. **Retain active** pending full line-by-line and source test reconciliation.
- [Site Student Safeguarding and Welfare](../site-student-safeguarding-and-welfare.md): restricted reports, direct external duty, privacy and legal obligations. **Retain active**.
- [School Operations Security Gates](../school-operations-security-gates.md): medical, incidents, field trips, athletics and conference data restrictions. **Retain active**.
- [Multidisciplinary Student Support Cases](../multidisciplinary-student-support-cases.md): restricted collaboration and case permissions. **Retain active**.
- [Synthetic Pilot Release Gate](../synthetic-pilot-release-gate.md): separate synthetic-data **HOLD** criteria, not approval for real minors.

**Default release posture:** HOLD for any claim of a legally approved, fully supervised school day until all applicable independent evidence and executed tests are recorded. A published website or passed documentation check cannot change this status.
