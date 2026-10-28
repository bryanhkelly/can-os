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
 * | C — a complete, safe school day | arrival, authorized supervision, attendance, an exception, authorized pickup, day reconciliation | GF4, GF34, GF35 |
 * | D — staff disruption and recovery | sick teacher / expired credential / no cover → qualified replacement, permissions and schedules update, families informed | GF3 and staffing services |
 * | E — end of term and school-year rollover | grades finalize, credits post, report cards issue, transcripts reflect the correct authority, students advance, next year opens without losing history | GF23, GF25 |
 * | F — student withdrawal or transfer | midyear exit stops future attendance/assignments, access revoked, records intact, official records issue/transfer | GF2, GF25 |
 * | G — institutional authorization changes | CAN–church agreement expiry stops protected operations, history survives, reauthorization restores | GF3, Golden Flow B |
 * | H — a completely new family joins | public site → inquiry → verified parent account → application → offer → consent → enrollment → first lesson, no seed shortcuts | GF22, GF2, Flow A |
 */
export * from "./harness";
export * from "./personas";
export * from "./school";
export * from "./family";
export * from "./classroom";
export * from "./evidence";
