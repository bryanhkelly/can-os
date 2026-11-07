# FullFlow operational patch status — 2026-10-23

**Branch:** `FullFlow`; draft PR #172. **Release:** HOLD. No merge to `main`, no production migrations, and no real-minor onsite acceptance.

## Completed source patches (not equivalent to passed runtime tests)

1. [`03c5b12`](https://github.com/bryanhkelly/can-os/commit/03c5b1224cdeb125186fa372e92cbdbbf5fbfb56) — close the unsafe extended-learning opening and guardian registration bypass. The same strict evidence policy now protects publish, an existing published season, registration and public catalog. Unimplemented evidence sources deliberately fail closed. Added pure unit regressions.
2. [`cface6d`](https://github.com/bryanhkelly/can-os/commit/cface6ddb9315c2960e0c9aa94c229f01b8b0bda) — disallow cross-organization CAN–church activation without separately verified Program–Site authority. Launch planning is still allowed. The enrichment UI uses actual server readiness and cannot display an actionable Publish control while blocked. Added church policy regressions.
3. [`fa7b4eb`](https://github.com/bryanhkelly/can-os/commit/fa7b4eb52200d34a50895285b48d9d573cd4cda3) — restrict sensitive support referral list/detail/mutation to assigned coordinator or current, resource-specific `sensitive_access_grants` with the required read/write field. Teachers see only their own submitted referrals, not private plans, service notes, or recommendations.
4. [`05b36e0`](https://github.com/bryanhkelly/can-os/commit/05b36e0f09fad3cb0ed89385793fa24eb2637505) — route new support cases to a single eligible active, nonsynthetic site-based specialist/counselor by area when one exists. No person receives site-wide case-browsing authority through the routing role. Unstaffed cases remain unassigned and require explicit triage workflow.
5. [`9c6f721`](https://github.com/bryanhkelly/can-os/commit/9c6f721b93fc0f6a0ee39227e6738558b0497d87) — redact free-text counselor review notes from reporter notifications, and sensitive plan goals/service outcomes from broad audit summaries. Restricted source records remain retained.

## Verified environment status

- Read-only query to the dedicated Neon **project `sweet-hall-62441909`, branch `br-proud-pine-arfju8h2`, database `neondb`** returned matching Postgres-reported branch/project IDs and **39 applied migrations**, through `0038`. Production, `test01` and other branches were not written.
- Latest sampled GitHub Actions run of commit `05b36e0`: CI `39976560910` and Admissions `39976561118` each reported failure with `runner_id=0`, no assigned runner and `steps=[]`. No test execution evidence; do not call these source patches tested or green.
- No synthetic case, school or guardian transaction, authenticated cross-role browser test or deployment was executed by this patch session.

## Next connected school story — follow in sequence

1. **Environment proof:** resolve GitHub Actions runner provisioning; run `npm run typecheck`, `npm test` and guarded `npm run test:integration:full-flow` on the dedicated migrated Neon branch and exact latest source SHA. Fix real execution failures rather than assuming the code works.
2. **Institutional authorization:** implement one versioned, independently approved CAN–church Program–Site operating authorization: request, separate CAN review, verified contract/document, effective dates, revocation and exactly scoped service entitlements. Do **not** use denomination affiliation or a selected academic provider as permission, and do not auto-provision cross-org accounts. Replace the explicit activation hold with a trusted database lookup.
3. **Institutional integration:** revise org-equality checks in program/year/section/onsite/academic/publishing pathways to require the explicit authorization + actor's own role/capability/resource grant. Preserve church Site ownership, CAN academic and issuer authority, existing same-org school flows and other-tenant denials. Explicitly test transcript issuance by CAN and denial for host-only registrar.
4. **Safeguarding:** implement separately protected intake, responder and fallback coverage, human escalation, individual external-report handling and audited, legally reviewed jurisdiction rules. Reuse existing incidents and sensitive-access infrastructure only where suitable. Generic support cases are **not** child-safety reports.
5. **Enrichment opening:** provide independently reviewed, versioned server evidence of safeguarding, staff screening/training, emergency procedures, pickup/release and dated coverage. Then connect this evidence to the shared gate in all four routes; the temporary fail-closed approvals must never be replaced by a browser attestation.
6. **Support cases:** implement verified assignment/reassignment and an authorized restricted triage queue for cases lacking a coordinator, service-specific participant grants, explicit field-based disclosure and separate-session negative tests. Existing auto-routing does not verify licenses or satisfy clinical policy.
7. **School day & family:** complete CAN/church site director delegation, actual school-year schedule and staff coverage, guarded admissions/guardian identity/consent/enrollment, teacher work and grade, onsite attendance exceptions, reconciliation and public site inquiry → application handoff on stable canonical IDs.
8. **Acceptance:** school initiator, independent CAN steward, local director, facilitator, CAN teacher/registrar, guardian and student must each authenticate in a separate real session; test expiry/revocation, wrong site/provider/issuer, unsafe opening, outbox, audit and browser reload. No seeded active states count as completion.

The branch's source changes improve safety boundaries; the main school operating flow is **still not accepted**.
