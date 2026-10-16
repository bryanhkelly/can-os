# Synthetic email-access fixture activation

The shared Neon `can-os` project contains synthetic actors only. The fixture seed
`scripts/seeds/identity-demo-accounts.sql` binds three accounts to existing
people at Synthetic Bay Campus:

| Non-deliverable placeholder | Role |
| --- | --- |
| jordan.student@can-os.invalid | student |
| riley.teacher@can-os.invalid | teacher |
| casey.specialist@can-os.invalid | specialist |

These are **not sign-in addresses**. A `.invalid` address cannot receive Resend email,
and no login link or token is pre-seeded.

To invite a tester, an authorized operator must identify a real email address
the tester controls, verify the invitation is appropriate, and replace the
placeholder account email **server-side**, never via browser-controlled
role/person identifiers. One person per account unless intentional multi-grant
facilitator access is explicitly approved. Grant changes must be audited.

Required deployment secrets:

- `RESEND_API_KEY`
- `CAN_ACCESS_FROM_EMAIL` (verified sending domain)
- `CAN_ACCESS_PUBLIC_ORIGIN` (exact HTTPS deployed origin)
- `CAN_ACCESS_TOKEN_PEPPER` (cryptographically random, at least 32 characters)

Do not store any secret in Git or expose it with a `VITE_` prefix. Configure these
per environment with the deployment provider.

**Not production ready:** The legacy application retains synthetic-only
functions that have not yet been migrated to session-derived authorization.
Do not place real student data into the shared environment. End-to-end email
delivery, cookies, CI, and multi-role permission tests must pass before
enabling sign-in for external testers.
