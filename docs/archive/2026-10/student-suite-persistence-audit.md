# Student suite: persistence and demonstration boundary

Current deployment uses known synthetic students and intentionally disables production writes.

## Already database-backed
- Assignment catalog, published assessments, submission history, draft submission writes and grading functions are implemented against canonical assessment/submission tables. Writes are gated off in production until authenticated roles are supported.
- Student notifications read from canonical notifications, and support referrals use actions and notifications.
- Course selection and enrollment use section/enrollment and associated request records.

## Remaining work before a live persistent student suite
1. Make saved preferences, last selected school/course and accessibility display options persist per real person. Do not infer identity from a demo selector.
2. Replace fixed sample person IDs on all server reads with authorized session-scoped identities.
3. Keep role and resource membership validation mandatory for writes, counselor records and guardian data.
4. Add integration tests on disposable Neon branches for submission-versus-autosave, enrollment-versus-withdrawal, and idempotent notification receipt.
5. Use schema migration checks and repeatable synthetic fixtures for every release.

## This sprint
Adds a more complete notification-center UI over existing persisted synthetic notification records. No new database table and no new authorization surface. The existing read-notification mutation remains blocked on production.
