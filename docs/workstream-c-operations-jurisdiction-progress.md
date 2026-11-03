# Workstream C — Operations & jurisdiction progress

Updated: 2026-11-03. Status: **partial implementation, not release acceptance**.

## Implemented on main
- PX-034: Public enrichment catalog excludes ended/canceled sessions from remaining bookable meetings, and sets `registrationOpen=false` when no future dated sessions or bookable package/full-season capacity remain. Canonical registration and existing independent publication approval remain authoritative; no new registration system.
- PX-050: Extended existing versioned jurisdiction requirement JSON contract with optional explicit school applicability, category, disclosure audience, and dates. Legacy records remain parseable but unscoped; absence of applicability must never be interpreted as statewide universality.
- PX-050: Added editors for requirement category, disclosure audience, and state/model/responsible-entity/service scope in existing review screen. Invalid/incomplete scoped drafts cannot pass server schema validation.
- PX-050–058: Added conservative pure applicability evaluation against authoritative school context and verified, effective profile version. Unknown/expired/missing source scope produces legal review required. Only explicitly scoped, cited public-audience requirements appear in the output. Added unit cases for mismatch, unknown, stale, revoked and private requirements.

## Not yet integrated / not yet verified
- The new jurisdiction evaluator is **not yet wired** into school-specific launch Actions/evidence or Agent A's approved public DTO. Do not consume this output on a public host without an institutional approval/revocation gate and a verified independent reviewer decision.
- Activities in setup, planned activity projections, parent-safe school-day/bell schedule, family service projections, staff/image consent, and cross-Site browser acceptance remain outstanding.
- Typecheck, lint, unit tests, database integration and browser flows were **not executed** in this GitHub connector session. No migration or production deployment has been run.
- Independent reviewer decision records must be checked by the server when it constructs the evaluator version input; the pure evaluator only validates the attestation's source snapshot.
- Source revision and live authorization withdrawal must be consulted on every public request (or revision invalidation), coordinated with A/B's public catalog gate.

## Integration handoff
Agent A owns final public-information DTO and institutional publication guard. Agent B owns template/public router. Agent D owns admissions. Agent C's narrow module is `src/domain/jurisdiction-applicability.ts`. Do not transfer legal decision authority to church website editors. Keep all seven days, locality and timezone configuration in canonical site/program schedules.

## Acceptance
No claim of school authority, legal compliance, deployed status or public-flow acceptance is made by these commits. Continue with canonical launch Actions and real operator configuration before treating PX-030–077 as complete.
