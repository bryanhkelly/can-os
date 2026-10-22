# FullFlow — one integrated school-network-to-classroom progression

## P0: canonical continuous six-stage journey

**[The single FullFlow acceptance contract](./full-flow-acceptance-contract.md)
is the primary priority and release gate.** One independently operated K–8
school must create a high-school extension, adopt course content, provision an
actual teacher/section, admit and activate a family/student, submit and grade
real work, notify/serve the guardian, and see the same persistent operational
record. The same tenant/program/section/student IDs must survive all stages.

**Current result: HOLD / NOT YET PROVEN.** Disconnected GF1/GF2/GF3 or network
tests do not satisfy this requirement. The top blocking condition is isolated
Neon acceptance configuration; the second is a continuous cross-role fixture.
Fix those before implementing more network-onboarding capabilities. Existing
denomination HQ/site affiliation work below is retained but **P2, optional
entry-path work**, not part of the core school end-to-end gate.

---

**Working branch:** `FullFlow`. No changes to `main` without explicit approval.
This checklist records evidence and blockers, not automatic production acceptance.

## Product boundary: agreements, affiliation, school operations

1. **CAN** contracts with an independent denomination/network organization. An executed commercial agreement is **not** the same as a verified user grant.
2. **Denomination HQ administrator** holds an explicit `network_admin` membership under their denomination organization. HQ may create **directly operated** Site records for that organization. This membership does **not** grant academic, guardian, medical, admissions, curriculum-publishing or student-operation authority.
3. **Independently governed church/school** remains the owner of its own Organization and Sites. A site can request denomination affiliation without changing `sites.organization_id`.
4. **Affiliation link** is a reviewed relationship between a denomination Organization and a pre-existing Site (with its owner Organization). It must have its own pending/approved/rejected/revoked state, evidence and independent permission checks. A pending request is **not** an approved network membership and approval is **not** a student-data grant.
5. **Local school operator/registrar** still performs the separate school/program launch, academic setup, admissions, enrollment and classroom activities under its own grants.

### Two intentional HQ entry paths

- **HQ-created location:** authorized denomination HQ administrator creates a `Site` with `organization_id` belonging to that denomination. No school program, admissions or student record is automatically created. Implemented in this bite.
- **Site-requested affiliation:** an authorized local school/site administrator identifies the denomination, submits an affiliation request, HQ reviews and accepts/denies. Keep the original site owner and school grants intact. **Implemented in code in bite 1C; isolated database and browser acceptance remain pending.** Do **not** use `organizations.parent_organization_id` to impersonate a reviewed multi-network affiliation or silently grant HQ academic access.

## Bite register

| Bite | Goal | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1A | Correct organization-wide vs site-limited school launch grant handling | In `FullFlow`, inherited from prior school-launch patch | Primary CI passed on prior isolated patch; signed-in acceptance pending |
| 1B | HQ creates its own location with distinct non-academic `network_admin` grant | Server commands, domain policy, HQ workspace and unit tests added on `FullFlow` | Primary CI passed; isolated database/browser acceptance pending; HQ grant must be deliberately provisioned |
| 1C | Independent site requests link to denomination; HQ reviews it | New `site_affiliations` table, local request/withdraw, HQ approve/reject/revoke, UI and guarded integration fixture added on `FullFlow` | Primary CI passed (run `39732006470`); database/browser acceptance pending |
| 1D | Verify network contract and provision HQ officer | Agreement evidence + effective-term table, CAN steward authorization, officer authority checks, server-side contract gates and steward desk on `FullFlow` | Primary CI passed (run `39735575551`); isolated database/browser acceptance pending |
| 2 | Independently governed school configures high-school extension | Existing GF3 flows, then closed-loop acceptance | Not accepted |
| 3 | Curriculum adoption, teacher and class provisioning | Existing canonical publisher/school/classroom tools | Not accepted |
| 4 | Family application, offer, activation and class assignment | Existing GF22/GF2 | Not accepted |
| 5 | Lessons, assignments, submissions and grades | Existing classroom/learning | Not accepted |
| 6 | Parent, teacher and operational follow-through | Existing GF1/GF4/actions/notification flows | Not accepted |

## Acceptance for bite 1B

- HQ grant belongs to a verified denomination Organization and has no Site restriction.
- HQ can create and read only Sites **owned by that denomination**, never Site/Student records belonging to independent affiliated entities.
- Repeating an identical create for the same slug is idempotent; conflicting slug details reject.
- Every successful write creates canonical transactional `SiteCreated` and `network.site.create` audit evidence.
- A local registrar or site-restricted HQ membership cannot create an HQ location.
- School creation, enrollment, staff grants and program launch are **not** side effects.
- Typecheck, build and unit tests are required; isolated Neon service test and real signed-in browser test remain separate acceptance gates.

## Open issues

- A legitimate HQ `network_admin` grant needs a separate authorized CAN onboarding/provisioning path; the existing school registrar staff invitation is not allowed to mint one.
- The existing `sites.organization_id` is an ownership edge, not a network-membership edge. A new association model with clear permissions and independent approvals is necessary for site-requested links.
- Do not assert a denomination-wide right to student data or treat a signed contract as automatic access.

## Bite 1C implementation — affiliation request and HQ decisions

- Independent local registrar can request one denomination affiliation for each owned/authorized Site; the request is scoped to the actual owner Organization and Site and includes a message.
- Only denominations with a currently active, organization-wide `network_admin` grant appear as request targets. This is an operational routing condition, **not** proof of a commercial contract.
- HQ can approve/reject a pending request and revoke an approved link; site owner can withdraw pending/approved links.
- Conflicting duplicate requests are refused; identical pending retries are no-ops; rejected/revoked links can be requested again and emit new event/audit evidence.
- Never edit `sites.organization_id`, user grants, enrollment, program, student or family records as a side effect.
- The new schema migration is `drizzle/0028_site_affiliation_link.sql`. Generated schema parity must be independently checked by CI. Do not deploy migration without review.
- `tests/integration/network-affiliations.integration.test.ts` uses a rollback-isolated synthetic site/denomination and the actual request/review commands, including cross-denomination denial and owner continuity; it is not counted as passed until a disposable-database run completes.

### Remaining blockers

1. Dedicated, authorized CAN-issued HQ membership provisioner tied to verified executed contract; current `network_admin` grants must be assigned out-of-band by an authorized steward.
2. Explicit, versioned partnership agreement/entitlement evidence must gate production affiliation approval. A verified HQ grant is not sufficient contract proof.
3. Browser acceptance with real authenticated sessions and an isolated database, including negative access to student/family endpoints, remains unverified.

## Bite 1D — verified partner agreement and HQ officer provisioning

A verified HQ login is **not** sufficient to operate a network. A verified **current agreement** is now required by the HQ site workspace, site creation, affiliation request target discovery, and HQ affiliation review. Once the agreement expires, HQ management operations fail closed; local school ownership and affiliation history remain unchanged.

A separate `can_network_steward` role, granted only under a verified CAN-network Organization with no Site restriction, can:
1. Record the existence of an externally signed agreement. It must reference an existing `documents` row with `subject_type='organization'`, denomination subject ID, `category='network_agreement'`, valid independent `verified_at` and `verified_by_person_id`, and no expired evidence. The steward recording the contract cannot be the same Person who verified that document.
2. Create an organization-wide `network_admin` grant only while a contract is current, with a second independently verified `network_hq_authority` Document whose `metadata.authorizedEmailNormalized` **exactly matches** the invited officer's normalized email. A locally existing account/person is reused; otherwise an account/person is created. This records a real membership but does **not** bypass email verification or send a mail message.
3. Review contract terms and the recorded agreement reference in `/network-steward`. This interface is a post-verification record, **not** an upload, e-signature, independent verification or contract-negotiation system.

Authority and evidence are **distinct**:
- CAN steward may not enroll students, open programs, modify schools' registrar grants or review student records.
- Denomination HQ grant may not manage student data or grant itself stronger roles.
- School registrar may not mint `network_admin` or `can_network_steward`, including by toggling existing grants' active status.
- All agreement and HQ-provisioning mutations write transactional audit and domain events. Identical contract reference retries reuse existing details; changed reference details reject; active officer membership retries reuse existing grant.
- New schema is `drizzle/0029_network_agreements.sql`, reviewed in GitHub CI only; **not migrated to production**.

### Remaining acceptance blockers

- The very first CAN-steward membership must be bootstrapped by a separately authorized operator; no browser self-registration or school registrar escalation exists.
- Independent signed-contract and HQ officer-authority verification/upload pathways are not yet implemented in CAN OS. The steward desk accepts IDs of **already independently verified** Documents, not legal attestation by checkbox.
- Contract term revocation and renewal workflows, explicit entitlements, independent verifier administration, account invitation delivery and dual-control review need subsequent focused bites before commercial production acceptance.
- Isolated Neon integration and authenticated-browser validation must run before treating this as fully accepted. Missing isolated Neon CI configuration remains a blocker.

**Last verified CI:** [run 39735575551](https://github.com/bryanhkelly/can-os/actions/runs/39735575551) passed on commit `194ef48758c36a41702934635c67ec4f810b9eec`. The separate Admissions Neon Acceptance job failed at **Require isolated test database secret** before running database-backed tests; it does not establish a failed product assertion. The focused mode `npm run test:integration:network-onboarding` is implemented but unexecuted.
