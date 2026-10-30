# CAN OS — site safeguarding, welfare and urgent child-protection concerns

**Status:** Required product + operational safety contract, with an unaccepted restricted reporting vertical slice now in source. Database migration, jurisdiction-specific legal review, isolated integration tests and browser acceptance remain pending. **Do not deploy the generic incident API or this slice as a certified compliant child-protection service.**
**Priority:** P0 safety architecture and jurisdictional reporting policy **before onboarding onsite minors**; P1 implementation alongside hybrid-site staff roles and multidisciplinary support.  
**Accountability:** CAN is the school of record in the intended model; local church or partner personnel may be the first adult to observe a concern. Formal institutional reporting and local contractual responsibility must be specified by state and partner, **without transferring or delaying any individual's legal reporting duties**.  
**Branch:** `FullFlow`, draft PR #172; no merge or production migration without authorization.

## Non-negotiable distinction

**Student learning/support cases** and **student safeguarding/safety concerns** may concern the same child, but need distinct intake, access controls, deadlines, external-action paths and records.

- **Ordinary academic/support:** reading challenges, missed work, coaching, instructional intervention, general attendance concerns → teacher, academic coach, assigned tutor, counselor or support-case team.
- **Safeguarding/welfare:** suspected physical/sexual/emotional abuse or neglect, exploitation/trafficking, unsafe home circumstances, threats or violence, serious bullying/harassment, intoxication or overdose concerns, substance misuse, criminal coercion or dangerous activity, self-harm risk, unsafe adult behavior → immediate safety-first response as circumstances require, trained designated lead, outside authority reporting where legally required, restricted evidence and protective follow-up.
- **Ambiguous:** a room facilitator need not diagnose, determine whether a crime occurred, or pick the legally correct label before making a concern report. Preserve initial observation as reported, let qualified responders route it, and do **not** force a routine referral to be approved before emergency action.

No automatic labeling of a child as an abuser, addict, criminal or victim. No AI inference from learning activity, demographics, behavioral patterns, attendance, socioeconomic status or disability. Observations, disclosures, third-party reports, professional determinations and external agency findings must remain explicitly distinguished.

## Who sees children and how they report

At the local physical site: **room facilitator, site leader, site administrator, aide/paraeducator, volunteers with relevant authorization, onsite teachers, coaches, mentors and other designated staff** may be the first to observe a concern. They must have a simple and appropriate **Report a safety concern** entry point, not need teacher/registrar powers, and not be able to browse unrelated cases. There must also be a documented non-app reporting path if the system is unavailable.

A common front door can ask:
1. **Is anyone in immediate danger or in need of urgent medical assistance?** Present emergency instructions and locally configured contact details; tell the adult to seek immediate real-world help rather than relying on the app.
2. **What was observed, disclosed, or reported?** Capture factual chronology, child's words as closely as practicable, time, place, persons involved, immediate action taken, evidence source and uncertainty. No invasive questioning, investigation or presumption of guilt.
3. **What kind of concern?** Selective, non-exhaustive categories: abuse/neglect, exploitation, violence/threat, bullying/peer harm, substance/medical danger, self-harm/welfare, other/unsure; multiple types allowed.
4. **What has already happened?** Record immediate safety steps, whether the reporter personally contacted external emergency/CPS/law-enforcement/other designated channels where appropriate, the time/channel/receipt **only if known**, and who was reached. A check box must never falsely certify a successful report.
5. **What internal support is needed?** Notify only named on-duty safeguarding recipients in accordance with the approved site/CAN escalation plan; time-bound acknowledgment, fallback coverage, handoff and protective action. Do not make a supervisor's acknowledgment a prerequisite for a legally required outside report.

For abuse/neglect, current California Department of Education guidance explicitly says the individual's legal duty is **not satisfied** by reporting to the school/supervisor, and supervisors cannot impede the outside report. Other jurisdictions have their own mandated-reporter categories, thresholds, recipients, deadlines and documentation rules. Counsel must configure and approve state-by-state rules before deployment. Reference: https://www.cde.ca.gov/ls/SS/ap/childabusereportingguide.asp

## Two connected, permission-separated workflows

### A. Safeguarding concern / incident (restricted and potentially urgent)

`onsite reporter → immediate protective action and legally required external reporting (not blocked by app) → designated CAN/site safeguarding recipient → protective plan / outside agency coordination as appropriate → recorded follow-up and closure rationale`

- An incident report is a record of a concern, **not a finding of abuse, substance misuse or criminal conduct**.
- Room/site staff may submit and see only their own acknowledgment and permitted safety instructions. Reporter visibility must not expose confidential downstream case information.
- The designated safeguarding lead may need institutional triage authority, but that authority **must not override a mandated reporter's independent duty**.
- More sensitive work (reporting to authorities, medical response, protected child interviews, law enforcement, Title IX/harassment or threat assessment, where applicable) follows distinct legally approved processes and role-based ownership.
- **Do not automatically notify guardians**: a guardian may be implicated, disclosure may put the child at risk, or external authorities may direct the timing. Need-to-know and legally compliant disclosure decisions must be made by authorized professionals.
- Serious bullying may require immediate safety steps and a school response without automatically creating a CPS or criminal report. Suspected substance exposure may call for medical care and counseling rather than automatic law-enforcement action. Reporting depends on facts, law, immediate danger and qualified human judgment.
- Record distinct statuses for **internal receipt**, **human response**, **external report attempted**, **confirmed submitted (where known)**, **outside agency acknowledgment (where supplied)** and **ongoing protective follow-up**; never equate in-app notifications, queued email or staff acknowledgment with an external report.

### B. Student support case (multidisciplinary, scoped)

`teacher or site staff concern → assigned case coordinator → counselor/coach/teacher/tutor/paraeducator service → documented outcome → safe student/family academic or welfare follow-up`

If safeguarding case work creates a need for tutoring, an agreed safety accommodation or supervised support, create only a **minimal, disclosure-approved task or opaque cross-reference** in the canonical `support_referrals` / `support_services` / `actions` workflow. **Do not copy allegation narratives, witness notes, external reporting details or restricted counseling records into general academic Actions, notifications, dashboards, student success summaries or guardian views.**

## CAN vs local site responsibility

- Every operating site must have a current, approved **safeguarding response roster**: first contact, deputy/fallback, local emergency contacts, applicable authority reporting instructions, after-hours response, CAN school-of-record escalation, and acknowledgments. Named coverage must be active before students attend onsite.
- A site leader or facilitator may be an **observing reporter** and emergency responder within their training and duties, without being granted counseling, registrar, investigative, discipline or schoolwide case-browsing privileges.
- The designated CAN/school official owns institutional follow-up and controls records within lawful scope; local partner staff have the minimum information required to protect the child onsite.
- Local church governance and CAN school governance must specify who employs/supervises onsite personnel, background screening and mandatory training, who must be contacted for urgent issues, and who is accountable for the follow-up and record retention.
- Training, supervision, staff handoffs, confidentiality, escalation simulations and local reporting channels must be operational requirements, not merely UI settings.

## Existing CAN OS foundation and observed gaps (October 22, 2026)

**Already in source:** `incidents`, `incident_people`, `incident_reviews`, `incident_notifications`, `incident_evidence` and `incident_amendments`; `incident-service.ts` supports filing, reviews, amendments, notifications and audit; `support_referrals`, `support_plans` and `support_services` handle ordinary support.

**Not yet proven / important gaps:**
- `Site Today` requires a registrar role. `roleCapabilities` has no defined site leader / room facilitator safeguarding submit ability. Incident-service uses `incident.file` etc., but current central role mapping does not grant these to onsite roles.
- General `getIncidentCase` currently authorizes on capability plus site/program scope; **named-case, sensitivity- and function-scoped access must be implemented before granting new roles access**.
- `queueIncidentNotification` writes a pending notification row; it **does not demonstrate external agency reporting**, dispatch, acknowledgment or legally sufficient compliance.
- Current support referrals route to counselors/specialists by site; the system has not implemented case-level confidentiality or restricted disclosure for sensitive allegations.
- No approved state/territory-specific reporting policy engine, 24/7 safeguarding roster, safety-centric onsite intake, agency-report confirmation, incident legal hold/retention or real multisite browser acceptance. Do not claim the current incident lifecycle completes any of these.

## Foundational contracts and site-bound first observers

- `src/domain/safeguarding-intake-policy.ts` provides the strict observation schema and display-only guidance. It rejects caller-supplied roles, legal findings, agency-report confirmations and automatic guardian-notification claims.
- `room_facilitator`, `site_staff`, `site_leader` and `paraeducator` identities have submit-only capability without incident reading, confidential case management, teacher, registrar or counseling powers. Their verified session and original single-site grant must pass `assertOnsiteSafeguardingSubmissionScope`.
- `evaluateSafeguardingSiteCoverage` remains a structural launch-review helper; it does not verify qualifications, legal approval, dispatch or operational acceptance.

## Restricted reporting vertical slice (October 28, 2026 — unaccepted)

- `/safeguarding` gives onsite reporters an easy-to-find intake and own-receipt view. Assigned `safeguarding_responder` / `safeguarding_lead` memberships receive a separate case view. Neither view queries or creates ordinary student-support referrals.
- `safeguarding-service.ts` files a canonical restricted `Incident` plus `safeguarding_concerns` facts. It uses transactional `AuditEvent`, `DomainEvent`, outbox and non-narrative in-app notifications; intake, evidence and external-report retries are idempotent.
- Durable site policy and named primary/deputy/CAN fallback configuration points are in `safeguarding_site_policies` and `safeguarding_site_responders`. Activation means operational review by an authorized manager only, never legal approval.
- Urgent reports route to all three named responsibilities. Other reports route to the primary and can be escalated. Acknowledgment uses the assigned responder's own `incident_notifications` handoff; it is not external reporting or emergency dispatch.
- Full case reads and response mutations require capability + restricted resource + organization/site/program scope + an active named assignment in `safeguarding_case_assignments`. Sensitive list/detail reads are audited. The generic incident service explicitly rejects safeguarding-specific records.
- Existing `incident_evidence` preserves restricted evidence references. Append-only `safeguarding_external_reports` separately records an actor's attempted, submitted or agency-acknowledged outside action; the original reporter may record an independent action without receiving downstream case access.
- No allegation narrative is copied into canonical notifications, support referrals, ordinary Actions, guardian views or Student Success.

This slice still has no generated migration, jurisdiction-specific legal sign-off, automated overdue-escalation scheduler, external agency integration, evidence upload flow, protective-plan/closure lifecycle, real multi-session browser acceptance or isolated database integration result. Those are explicit release gaps, not implied capabilities.

## P0 safeguards before wiring production functionality

1. Obtain qualified legal/child-protection review for each launch state and program type, including mandated reporting, child welfare agencies, law enforcement, school operations, privacy/FERPA and any other applicable requirements; include training materials and process owner.
2. Add purpose-limited `safeguarding.report` (submit-only) permission for authorized onsite roles **without** granting `incident.read`; case readers, response leads and external-disclosure officers need separate explicit scoped powers.
3. Implement a resilient first-observation workflow and emergency notice, *without* implying entering data satisfies legal duty. Add offline/phone procedure.
4. Introduce case-level ACL/assignments, field-level filtered access, auditable sensitive reads, tamper-evident append-only observation corrections and protective retention controls.
5. Build validated in-app handoffs with escalation if unacknowledged (including no-staff-on-duty fallback). Avoid unsafe auto-text/email with allegation details.
6. Test immediate danger, suspected abuse with implicated guardian, suspected peer harm, substance-related medical emergency, ambiguous disclosure, offline outage, unassigned staff access, revoked grants, wrong-site and wrong-student privacy, simultaneous reporters, and failed notifications.
7. Only after privacy/case controls pass, link downstream **safe task summaries** to support cases and Student Success.

## External-reference anchors (not deployment approval)

- California education department, child abuse reporting and independent duty: https://www.cde.ca.gov/ls/SS/ap/childabusereportingguide.asp
- U.S. Department of Education, FERPA emergency exception is limited and context-specific: https://studentprivacy.ed.gov/faq/when-it-permissible-utilize-ferpas-health-or-safety-emergency-exception-disclosures
- U.S. Department of Education, FERPA emergency disclosures require recording threat and recipients: https://studentprivacy.ed.gov/faq/does-school-have-record-disclosures-made-under-ferpas-health-or-safety-emergency-exception
- SchoolSafety.gov, reporting programs and coordinated threat assessment: https://www.schoolsafety.gov/

**Out of scope for a generic ticket queue:** performing child protective investigations, establishing probable criminal guilt, clinical or addiction diagnoses, legal determinations, or substituting software for urgent protective action.
