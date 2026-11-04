# ADR: Scale-safe people, qualifications, evidence, and program configuration

Status: Proposed, binding design guardrails for PR #32 before production migration.

## Non-negotiable boundaries
1. Person is global identity, not staff/employment/role. Staff, students, volunteers, alumni can overlap and change over time. RoleAssignments and Memberships determine work and scope, not profile attributes.
2. Qualification claim (person-owned), issuer assertion, review decision and program eligibility are **different facts**. Never equate a displayed badge with permission to teach or supervise.
3. A qualification definition is not a hardcoded CPR enum. Use typed qualification catalog entries with versioned attributes and applicable jurisdictions. Education/degrees, experience, training, licenses, clearances and renewals each have specialized evidence but share an evidence and evaluation backbone.
4. Credential decisions and evidence are append-only. Correction/revocation supersedes history; never erase prior verifier decisions. Scope reviewer by actual institution/subject relationship and record immutable actor/time/source.
5. Policy is effective-dated and versioned, built from reusable criteria composed via all/any/threshold and optionally exceptions approved under explicit authority. Reject missing or unsupported policy operators; never consider empty AND satisfied.
6. Requirements belong to framework/version, then applicability binds them to jurisdictions, organizational programs, role assignments, age/grade, activity and delivery model. Do not duplicate framework requirements per site. Track overrides separately with reason, approver and validity.
7. One program configuration version has typed extensible feature settings and links to assigned actual parties (Organization/Person/RoleAssignment), not only string values `host | can | partner`. Accountability must be explicit for instruction, supervision, safeguarding, records, finance.
8. Accreditation evidence is a reference to source operational facts and documents plus their snapshot and verification trail. A report/export is an auditable assembly of accepted evidence, never a declaration that a school is accredited.
9. Permission enforcement requires actor + capability + target resource + actual membership/relationship + sensitivity. A non-empty actor scope is not sufficient. No public directory of minors or sensitive credential attachments.
10. Qualification readiness is a computed projection over valid policy, verified facts and effective time. Cache/incrementally recompute for large scale, but never use it as the sole security authority. Invalidation includes expiration, revocation, role changes, applicability changes and policy version activation.

## Migration blockers for PR #32
- Replace string owner matrix with reference-backed responsibility assignments.
- Introduce stable catalog/framework identity distinct from versioned policy requirements.
- Add review history and evidence source lineage with transactionally written DomainEvent and AuditEvent.
- Decide whether staff profile data is stored globally or per affiliation; distinguish public-facing biography from private HR information.
- Use real authenticated membership-backed resource policy checks; `assertProfileRead` only asserts a resolved proof supplied by a trusted service.
- Convert the preview's hardcoded CPR requirement to a seeded/configured policy when connecting to Neon.
- Generate reviewed Drizzle migrations and execute CI/test pipeline before merge.

## Evolution strategy
Keep the current pure rules under `src/domain/qualification-policy.ts` as a minimal, fail-closed expression evaluator. Extend via versioned rules and a backend validation registry, not ad-hoc `if (role === ...)` branches. Apply policies at a specific date, with a deterministic evaluator and clear explanation/reasons. Store immutable evaluation snapshots for audit, while calculating current status on demand or via invalidated materialized projections.

## Teacher records and school-selected requirements

Document a teacher's resume/work history, education and degrees, licenses,
certifications, training and other qualification evidence in the person-owned
private qualification record. These are reusable facts about the teacher, not
automatic requirements for every school and not public profile attachments.
A resume is a self-reported history document, not proof of a degree or license.
Evidence submission, independent verification, expiration and revocation remain
separate facts.

Each school, through its authorized academic policy publisher, selects the
qualifications required for its Programs and teaching roles from the shared
catalog. Applicable jurisdictional and institutional requirements still apply;
school choice does not waive them. Different schools may select different
requirements while evaluating the same teacher's existing evidence. Neither
an agent nor a seed script should choose a license-versus-degree policy simply
to make a demo eligible.

Current code supports basic catalog definitions, private PDF/JPEG/PNG evidence,
claims, independent review and effective-dated Program policies. Teachers can
also record education, teaching experience and specialties in a private,
self-reported professional profile. Those details are not evidence and do not
verify a degree, license or certificate; submit those through qualification
claims for independent review. Identity documents such as a driver's license
are not universal teacher requirements; collect them only when an applicable
school/program policy requires them, using restricted evidence storage and
scoped review. This does not establish a structured resume editor or
specialized degree/license validation merely by accepting a catalog entry.
The current launch policy editor publishes nonempty sets of required
qualifications before opening; active-Program policy repair requires a
separately reviewed migration. Missing policy or evidence remains a readiness
blocker, not implicit approval.

Students may complete a lightweight, optional self-profile with a preferred
name, pronouns and interests. Student sign-in access returns them to their own
profile after the existing guardian-consent and school-approval handoff; it
does not gate their learning workspace. Legal identity, grade, enrollment and
student access remain school-managed. The existing private profile-photo flow
is reused.

Synthetic demonstrations use the same records, policies and authorization.
Simulated evidence must be explicitly labeled and never represented as real
credentials, legal consent or delivered email. `.demo` shared-code access
does not depend on working email delivery, and must not silently turn into
ordinary verified-email ownership. Existing operator-reconciled fixture
verification must retain its simulated-source audit evidence.

## Scale acceptance scenarios
- One instructor teaches across many independent sites without duplicate Person or degree rows; each school applies its own requirements.
- A region introduces stricter teacher credentials with an effective date; historical reviews remain reproducible.
- A CPR issuer revokes a certificate; affected site eligibility recalculates without changing the original certificate history.
- A minor's school information is not returned to an unrelated school's staff or to a generic directory user.
- Accreditor A accepts two alternative evidence types, Accreditor B requires three simultaneous elements; both use configured policies.
- A site can delegate supervision to a named legal Organization and assign a specific accountable RoleAssignment for the term.
- A school switches from five days onsite to hybrid schedule with effective-dated configuration, never silently rewriting prior attendance expectations.
