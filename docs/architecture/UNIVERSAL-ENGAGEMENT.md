# Universal Engagement: governed platform boundary

Status: foundation source on `release-11232026`. Source is **not** a deployed, end-to-end validated release.

## Invariants

- `/go/:code` is one public entry mechanism for marketing, learning, hiring, partnerships, events, funding, surveys and community services.
- Engagement is not enrollment. Campaign interest and visitor navigation never create a learner, employee, partner, guardian relationship or formal authorization.
- Ownership is platform, Organization (including a national network), Site, or Program. Site and Marketing Package references are optional for a platform-owned engagement.
- Engagement definition is separate from link: one versioned definition may have multiple channel-specific links. The link's owner is never a caller-supplied identity.
- Engagement content versions are immutable. Links can be revoked independently, and a retired definition stops new entry without erasing history.
- The six dimensions are domain/purpose, subject, audience, interaction, experience, and expected outcome. Expected outcome is **not** evidence that the action occurred.
- Execution modes are `redirect` and `page` initially. `resume` requires a separately implemented, authenticated checkpoint; it is intentionally not executable yet.
- All destinations come from a finite typed registry. No user-controlled external redirect URL, script URL or unrestricted HTML field.
- Browser visits are not automatically treated as verified engagement. Email link scanners are common. Formal facts must come from source business services and consent-aware reporting.
- Identity, contact opt-in, eligibility, consent, staff checks, agreements, payments, admissions, and training authorization remain with their current source systems.
- Anonymous links confer zero privileges. Personalized token flows must verify the recipient before revealing private state.
- The registry is a platform module, with Launch Studio one consumer rather than its owner.

## Storage

- `engagement_definitions`: stable owner and revocable lifecycle.
- `engagement_definition_versions`: immutable public specification and experience snapshot.
- `site_go_links`: original short-code store, extended for an optional engagement version. Legacy Site/package links remain readable. **Do not introduce a second competing short-code table.**
- Do not introduce a shadow CRM or contact table. Reconcile future outcomes from authoritative operational records.
- `0106_universal_engagement.sql` is additive for existing records but changes old Go Link scope columns to optional. Review and validate on a disposable branch before production.

## Scope of first runtime slice

- A link may redirect to the original governed action or render a safe, versioned invitation/information/opportunity landing.
- A rendered landing may navigate to an existing action, but never submit a new domain transaction itself.
- Legacy Site Go Links continue resolving through the existing destination handler.
- Creating engagements is authorized through existing platform and scoped Organization/Site/Program grants. No direct anonymous authoring.

## Acceptance gates

1. Compile, run unit tests, and check DB migration journal.
2. Anonymous valid/unknown/revoked links; published/retired definition; invalid destinations; target closed independently.
3. Platform owner, network Organization admin, Site admin, unrelated Site staff, and delegated view-mode access.
4. No cross-Organization leakage; no public exposure of confidential contacts; audit writes and idempotency/retry.
5. Verify against the exact deployment commit and matching database migration.
