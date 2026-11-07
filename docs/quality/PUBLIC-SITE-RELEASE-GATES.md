# CAN OS Public Site and Admissions Release Gates

**Status:** Canonical acceptance requirements. **No gate is certified passed by this document.** Historical FullFlow testing and October issue statuses are evidence to investigate, not a waiver or current production authorization.

**Scope:** Tenant school websites, public hostnames, anonymous interest, verified applications, admissions and connected school handoff. See [CAN OS Acceptance Standards](ACCEPTANCE-STANDARDS.md) and [School Operations Security Gates](../school-operations-security-gates.md).

## Release gates

| Gate | Priority | Evidence required |
| --- | --- | --- |
| PUB-GATE-01 | P0 | Disposable Neon schema and Drizzle parity; migration safety; exact environment identity; build, typecheck, unit and integration test output at the candidate SHA |
| PUB-GATE-02 | P0 | Authenticated and anonymous browser journey for Site publication, approved Program listing, adult inquiry, verified family application, guardian offer and enrollment; reload, idempotency and downstream identity continuity |
| PUB-GATE-03 | P0 | Tenant host/path isolation, spoofed Host and Forwarded-Host, unauthorized SSR/server functions, HTTP method/body handling, CSP, caching and host-scoped authentication cookies |
| PUB-GATE-04 | P0 | Trusted-edge anti-abuse controls: per-source limits, bot/spam denial, failure alerts, observability, traffic budgets and fail-closed behavior |
| PUB-GATE-05 | P0 | Explicit versioned adult contact consent, capture time/channel/purpose, opt-out, suppression, retention/deletion and privacy-safe access audit |
| PUB-GATE-06 | P0 | Institutionally and legally approved public host/institution/provider/credit issuer/accreditation, tuition, admissions and school-opening claims; no implied authority |
| PUB-GATE-07 | P0 | Multi-tenant and race-condition security checks: publisher grants, Program scope, independent publication, public DTO minimization, inquiry/application contention, guardian reuse, audit failure rollback |
| PUB-GATE-08 | P1 | Accessibility, responsive and keyboard/screen-reader checks, approved media rights and student consent, HTTP security, observable errors and takedown/rollback procedures |
| PUB-GATE-09 | P0 to enable external traffic | Explicit operator authorization of DNS/TLS, provider routing, production migrations/secrets, marketing exposure and rehearsal of disabling public access |

The original October GATE-01 through GATE-09 work is preserved in the [retired delivery backlog](../archive/2026-11-fullflow/retired-plans/public-site-admissions-remaining-work.md). These requirements may have been partly implemented after that snapshot; **recheck actual current main** before categorizing a gap as open or resolved.

## Mandatory negative scenarios

- A published Site does not independently authorize a Program to open, admit, award credits or claim accreditation.
- Unpublished, withdrawn, expired or non-admitting Programs cannot present actionable Apply entry points. Lawful existing Application and Enrollment records remain intact.
- Unrelated Site/Program/guardian actors cannot read or mutate private academic, family, financial or operational records.
- A name, email, social URL, imported website, image upload or interest record never creates a guardian relationship or establishes copyright or child-subject consent.
- Platform host sessions, tenant Host headers and rewritten public routes cannot bypass server authorization or reach internal endpoints.
- Public rendering excludes unpublished draft content, internal Program/Season DTOs, staff/student private data and storage keys.
- Inaccessible HTTPS hosts or unverified certificates cannot be reported as live.
- Failed anti-abuse enforcement must reject public writes rather than silently allowing traffic.

## Evidence record

For each gate preserve the exact Git SHA, environment and isolated Neon project/branch, executed commands, output/artifacts, public DNS/TLS proof, actors and relationship scopes, pass/fail, negative cases, reviewer, exclusions and date. Declared fixtures, source reviews, old branch reports and an application build are **not** equivalent to executed release acceptance.

## Operational approval boundary

Actual database migration, wildcard DNS/TLS and hosting provider setup, production family outreach, child media rights, institution legal approval, opening authorization and traffic enablement are separately controlled actions. This document cannot authorize them. Confirm provider-specific steps from the current deployment configuration before using the [Public Hosting Runbook](../public-tenant-hosting-release.md).

## Related specifications

- [Public Sites and Admissions](../product/PUBLIC-SITES-AND-ADMISSIONS.md)
- [School Launch and Run](../product/LAUNCH-AND-RUN.md)
- [Website Studio](../product/WEBSITE-STUDIO.md)
- [School Operations Security Gates](../school-operations-security-gates.md)
