# GF26 Study Groups implementation

StudyGroup, Membership, Session, Post and Report are persisted in Neon via Drizzle.
Two group kinds: course and interest. Discovery is currently limited to the
synthetic Site; cross-Site eligibility is not implemented. Memberships require facilitator approval.
Never disclose group posts to unapproved members. Moderation reports are staff-only.

**Security:** this first development release uses declared synthetic identities, not login.
Reads and mutations stay enabled. A future authenticated actor and scoped authorization
must replace demo identities before real student data is introduced.

Load only the committed synthetic fixtures. Do not seed real children or personal data.

The application view supports discovery, request to join, discussion, group creation, sessions, report and moderation through the synthetic server workflow. It is the first development release, not a completed authenticated social network. Still ahead: identity provider, verified enrollment eligibility, parent safeguarding/consent policy, and report escalation SLA. Session creation already writes the canonical calendar event in the same transaction.
