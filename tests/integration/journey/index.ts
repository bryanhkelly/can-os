/**
 * Golden-flow journey toolkit.
 *
 * Reusable components that let an end-to-end journey compose canonical
 * commands instead of copy-pasting fixture boilerplate:
 *
 * - `harness.ts`   — rollback-isolated Neon transaction + server-function and
 *                    command-context wiring + actor switching.
 * - `personas.ts`  — verified person/account/grant + AccessContext per actor;
 *                    explicit-capability service contexts; cross-person denial.
 * - `school.ts`    — the canonical independent-school launch (GF3): launch
 *                    commands, publisher authoring, adoption, Section, verified
 *                    teacher, activation, enrollment Journey configuration.
 * - `family.ts`    — the canonical GF22→GF2 chain: application, independent
 *                    guardian verification, configured consent, offer,
 *                    acceptance, activation, Section placement.
 * - `classroom.ts` — publish/submit/grade steps over the same Section.
 * - `evidence.ts`  — exactly-once domain-event/audit/notification assertions.
 *
 * Proposed end-to-end journeys these components exist to make easy:
 *
 * | Journey | What it must prove | Existing coverage |
 * | ------- | ------------------ | ----------------- |
 * | A (FullFlow) | launch → curriculum → family → work → grade → operations on one Program | full-flow.integration.test.ts |
 * | B — church-hosted school established | independently owned church Site + CAN academics from the beginning; local authority and safeguarding stay separate | product functionality + contracts; no tested journey yet |
 * | C — a safe school day | arrival, authorized supervision, attendance, an exception, incident + health response, day reconciliation; verified custody release is a BLOCKED leg (no pickup capability exists) | GF4, GF34, GF35 |
 * | D — staff disruption and recovery | sick teacher / expired credential / no cover → qualified replacement, permissions and schedules update, families informed | GF3 and staffing services |
 * | E — end of term and school-year rollover | grades finalize, credits post, report cards issue, transcripts reflect the correct authority, students advance, next year opens without losing history | GF23, GF25 |
 * | F — student withdrawal or transfer | midyear exit stops future attendance/assignments, access revoked, records intact, official records issue/transfer | GF2, GF25 |
 * | G — institutional authorization changes | CAN–church agreement expiry stops protected operations, history survives, reauthorization restores | GF3, Golden Flow B |
 * | H — a completely new family joins | public site → inquiry → verified parent account → application → offer → consent → enrollment → first lesson, no seed shortcuts | GF22, GF2, Flow A |
 * | I — network and church affiliation | HQ network established; independent churches affiliate; approval grants no automatic student-record access | network-onboarding / network-affiliations suites |
 * | J — curriculum lifecycle | publisher versions → adoption → delivery of the approved version without unexpected change | curriculum suites; pack flow inside `school.ts` |
 * | K — student intervention and recovery | struggle detected → teacher intervenes → guardian participates → improvement measured | GF1; academic-intervention suite |
 *
 * Online (CAN Direct) and hybrid (church-hosted) delivery are configuration
 * variants of these journeys, not separate ones. Every journey is
 * cross-persona: the responsible actor can act, the family/student sees the
 * result, the record changes, and an unauthorized person is denied.
 */
export * from "./harness";
export * from "./personas";
export * from "./school";
export * from "./family";
export * from "./classroom";
export * from "./evidence";
