# GF26 Study Groups implementation

StudyGroup, Membership, Session, Post and Report are persisted in Neon via Drizzle.
Two group kinds: course and interest. Discovery is currently limited to the
synthetic Site; cross-Site eligibility is not implemented. Memberships require facilitator approval.
Never disclose group posts to unapproved members. Moderation reports are staff-only.

**Security:** the current application has synthetic identities, not login. All
reads and mutations remain disabled in production. A real authenticated actor
and scoped authorization must replace demo identities before activation.

Synthetic development fixtures may be loaded only in non-production development databases. Do not seed real children or personal data.

The initial application view supports discovery, request to join, discussion, group creation, sessions, report and moderation through a demo-only server workflow. It is **not** a production-ready student social network. Before release: authenticated principals, verified enrollment eligibility, parent safeguarding/consent policy, audit, notifications, report escalation SLA, and calendar-event transaction integration.
