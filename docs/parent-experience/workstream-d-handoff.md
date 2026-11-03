# Workstream D — Integration handoff (2026-11-03)

Status: **implementation slices committed to main; not release accepted**. This document distinguishes actual D-source changes from remaining cross-agent work. Never interpret a code commit as a successful browser journey, a deployed tenant host, or legal authority.

## D-owned code delivered

- `src/modules/enrollment/public-family-start.server.ts`: a published Site's email verification request and redemption now require reviewed academic snapshot parity, live academic instruction/school-of-record/admissions services, and an active school-year seat pool with positive configured capacity. Capacity >0 is **not** a seat-availability proof. All application mutations still use the canonical `startFamilyApplication` and must recheck legal authority.
- `src/domain/public-family-cta.ts`: typed fail-closed CTA adapter. `applicationOpen` AND separate `intakeEligible` are required before returning Apply. Marketing publication never implies authorization.
- `src/routes/guardian.apply.tsx`: verified returning guardians are prompted to resume matching applications, while retaining the ability to submit for a sibling. No parallel application system.
- `src/domain/public-admissions-interest.ts` and `src/modules/enrollment/public-admissions-interest.server.ts`: optional `purpose=visit_interest` uses existing scoped, consented interest record with **explicit not scheduled** wording. An ordinary information inquiry no longer suppresses a separate visit-interest submission within 24 hours. This does not create a CalendarEvent or confirm a reservation.
- `src/domain/parent-packet.ts`: request-time escaped print HTML from approved `PublicParentSchoolProfile`. Does not create/stash a second packet. Displays no private finance, household, custody, medical or student data; no amount without an approved financial claim.
- `src/domain/public-information-readiness.ts`: diagnostic gaps from A's approved projection, linked to existing screens, with independent information/marketing/host/admissions/opening statuses. It does not grant permission or persist website tasks.
- Unit tests added/updated: `tests/unit/public-family-destination.test.ts`, `tests/unit/public-family-cta.test.ts`, `tests/unit/public-visit-interest.test.ts`, `tests/unit/parent-packet-readiness.test.ts`.

## Integration owner: required wiring

1. **A/B:** Consume `academicFamilyCta` in the shared Site renderer or a compatible adapter. Supply `intakeEligible` from server-reviewed application window, active school year, capacity including held offers/enrollments, grade/age eligibility, operating model and legal authorization. The current academic catalog's `applicationOpen` is necessary but insufficient and must not directly promise an open admissions window. Keep public origin isolated from authenticated portal.
2. **B:** Add a visit-interest choice to the public inquiry form only after a Program has an actual eligible visit/contact flow; send `purpose=visit_interest`. Never say a visit is booked. Route confirmation into existing CalendarEvent and staff/Action workflows if the school offers scheduled visits.
3. **A/B:** Wire `renderParentPacket` from an approved, currently live read model at request time with print-only response headers. A draft preview is not a public packet.
4. **A/B:** Wire readiness diagnostics into the authenticated Site launch/publishing workspace with owner-specific permitted links. Do not use readiness count as legal approval. All claims are still projected, not a new CMS.
5. **C/finance:** There is no institution-approved, grade/term/Site/Program/publication-version academic tuition and aid read model in current CAN finance source. `financeInvoices` represent **private household obligations** and MUST NOT be published as sample school tuition. Keep `tuition.description` unconfigured and render Request tuition details until finance/compliance supplies an audited approval projection.
6. **D/integration:** Independent, scoped visit follow-up owner/due date via canonical Action; actual scheduled-event confirmation; complete offer/enrollment browser continuity; admission enrollment-window/grade/age/full-pool checks on **every mutation**; verified parent/registrar cross-Site and retry acceptance. No new admissions or CRM tables.

## Release validation not yet executed

No local or CI typecheck, lint, unit suite, build, disposable-Neon transaction test, real browser test, public host/DNS check or production deployment is evidenced by these commits. Run those checks after integrating concurrent A/B/C changes. Never mutate production to test these flows.

## Review traps

- A public `Program.status=active` is not admissions authority or an available seat.
- `admissionSeatPools.capacity > 0` proves only a configured pool; it does not subtract active enrollments or reserved offers.
- An email-verification link proves email ownership, not legal guardianship.
- A visit request is an inquiry, not a confirmed calendar event.
- A complete marketing website is neither a legal opening approval nor an operating school.
