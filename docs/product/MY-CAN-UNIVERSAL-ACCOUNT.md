# My CAN universal account, school relationships and discovery

**Code branch:** `main`  
**Runtime acceptance:** not yet verified end-to-end  
**Design authority:** CAN OS V6.1, with square corners, operational type and the shared workspace shell

## Core contract

A person has one CAN account for learning, staff work, guardianship and schools. A school or site favorite is **not** a membership, registration, staff appointment, guardian relationship, admission offer, Section, or security grant. One can register for multiple offerings at different locations without creating more user accounts.

The account and Person record live outside school-bound relationship records. Formal decisions remain with their authoritative program and institution. Personally editable preferred name/phone is not an official legal name, child verification, health record, credential or staff identity check.

## Built in main

- `/access/register`: **adult self-signup** (18+ self-attestation) using the existing one-time verified-email link, anonymous global rate limiting, single-use challenge and safe same-origin return path. Provisional names are not a logged-in Person until verified. A minor joins through an authorized school or guardian flow; age verification beyond self-attestation needs its own governed policy.
- The `account_holder` role has **zero** institutional capabilities, organization IDs or site IDs. It lands at `/account/`.
- Email-link redemption transaction provisions a self-declared Person and a personal grant only when the existing account has no active verified institutional grant. Concurrent or repeated unverified submissions do not override an active name in a pending signup.
- Existing school founder signup reuses a verified personal Person rather than inserting a duplicate. Existing staff invitation issuance rejects ambiguous real-person identities; family verification already reuses a uniquely linked Person and independently verifies guardian authority.
- `/account/`: verified-account workspaces, role switching, personal contact preferences, favorite locations, account security. The personal contact write is scoped to a single active real Person, audited without raw values, and refuses ambiguous Person/account or demo identities.
- `/explore/`: read-only program-first and place-first discovery using existing approved, publicly published Site and program/extended-learning read models. Listings exclude demo fixtures, do not infer permission to open or enroll, and lead to the already-authorized school/extended-learning published Site workflow. Current discovery is bounded to the first 20 Sites.
- `/canonical/lab/enrollment`: internal provider enrollment preview remains informational; it does **not** submit canonical noncredit registrations.
- My CAN links are in the account menu, sidebar, Settings, sign-in, and public program explorer.
- Account favorite Site storage and RLS from `0081`; provisional personal signups and RLS from `0082`.
- `0083_account_site_contact_consent` adds append-only, purpose-bound, revocable sharing of verified email, CAN display name and optional contact phone to a specifically identified Site. My CAN presents grant and revoke actions separate from favorites. Only an authorized same-Site `site_admin` or `registrar` can request a particular Person's shared contact for the exact authorized purpose. Provider reads are audited and serialized with revocations. Student-linked accounts cannot directly grant contact sharing until an authorized guardian-managed pathway exists.
- Migrations 0081–0083 applied to `test01` and production/default Neon branches, with table presence, RLS flags and policy counts inspected. No test users or enrollment records were inserted.
- Unit test sources committed for personal role/capabilities, adult signup validation, account/Person consistency, favorite-publication checks, favorite scope, contact validation, consent purpose and revocation. These have not yet run in a complete repository environment.

## Current flow

1. A person may explore published schools/programs before logging in.
2. They register a personal CAN account or sign in to an existing email.
3. A single-use verified email token creates the Person and personal account grant if the account is new.
4. My CAN presents authorized workspaces and saved locations. Saving a Site never conveys access.
5. On joining a published school program or receiving a staff invitation, the existing authorized intake service reuses the account and single known Person when it can verify that identity; it never infers legal guardianship or employment.
6. Specific program/student/guardian/staff relationships remain owned by the institution. A published listing links to those independently governed flows.

## Remaining critical engineering

- **Native v3.0.1 noncredit adult self-registration:** must create an authorized `noncredit_registration` plus `learner_course_attempt` only through a published/approved adoption/deployment and a verified canonical Person/grant. Canonical accounts and sessions are independent of the legacy `public` account tables; the existing operator-verified crosswalk is not an automatic login bridge. **Do not link Persons by email or mint canonical learner grants from favorites.**
- **Facilitated groups:** publish per-site cohorts/locations and use invitations and room attendance without creating duplicate individual registrations.
- **Portability/consent:** the explicit purpose-scoped contact read and revocation are built; next connect the consented fields into authorized provider application/intake forms, implement guardian-managed student disclosure and ensure each Site records its separately governed admission or employment data. No automatic sharing of sensitive institutional records.
- **Youth and staff:** verify one real Person across multiple existing school/student/guardian/staff roles with independently approved relationships; reconcile legacy duplicate Persons under operator review, not auto-merge.
- **Discovery scale:** server-side query filters, pagination and indexes; the first 20 published Sites are not a complete national search.
- **Release gates:** checkout/install, TanStack route generation, TypeScript/build, unit tests, route inventory, restricted-principal RLS, dual-account/cross-Site privacy, Playwright for personal signup, existing school/guardian/staff enrollment and mobile/V6.1. Check actual deployment commit before claiming the site is live.

No new feature flags were added. A commit to `main` is not proof of a successful deploy or CI.
