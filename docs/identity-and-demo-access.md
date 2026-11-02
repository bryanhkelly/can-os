# Identity and Valor School demo access

## Product direction

CAN OS is one multi-tenant application. Valor School is an ordinary tenant
whose records are synthetic because they belong to that tenant; it is not a
separate app, workflow, or authorization model. Its Organization → Site →
Program relationships and the normal account, person, membership, capability,
and resource-relationship checks remain authoritative. Tenant scope—not
per-record synthetic flags—identifies this environment.

The public demo personas use `@valorschool.demo` accounts and the shared access
code `000000`. Each persona signs in as its own account and uses its own active
grant. The legacy facilitator and mirrored grants remain retired.
`admin.demo@valorschool.demo` can use the top-bar **Demo account** selector to
switch freely among active Valor demo accounts, including new applicant accounts,
and return to admin without signing in again. The shared code does not establish who the human visitor is, so audits
identify the account/persona and effective role—not a real-world facilitator.

## Current access controls

- Demo sign-in and account switching work locally and on Netlify production
  without demo-access flags. The shared accounts are intentionally public,
  limited to active grants at the configured Valor School organization and
  site and supported product roles, and must never contain authentic records.
  The connected database must already contain those accounts and grants;
  `CAN_ACCESS_TOKEN_PEPPER` must be configured to issue sessions.
- Email-link requests for `@valorschool.demo` are suppressed. The personas
  receive no email links or individual passwords.
- Ordinary membership selection is limited to the authenticated account.
  The fixed demo admin account is the only exception: its active canonical
  registrar membership authorizes selection of
  active, supported memberships belonging to enabled `@valorschool.demo`
  accounts with active people at the configured Valor organization and site.
  Every request rechecks that admin membership and the selected membership.
  The session remains owned by admin, but capability, account, person, scope
  and relationship checks use only the selected membership. Switching writes
  an immutable audit with the admin actor, effective account/person and session.
  A full page navigation clears the previous workspace's mounted state/caches.
  The selector remains disabled until client handlers are ready.
  Sign-out revokes the admin-owned session, including while viewing another account.
- Demo-school notification email, SMS verification, and subscription SMS/email
  delivery are suppressed using the source organization scope. Other external
  integrations still require an explicit tenant-safety review.
- The provisioning command is an explicit operator action and still requires
  `CAN_DEMO_FIXED_ACCESS_ENABLED=true`. It does not run at login or during
  normal application requests:

  ```powershell
  $env:NODE_ENV = "development"
  $env:CAN_DEMO_FIXED_ACCESS_ENABLED = "true"
  npm run demo:provision-registrar -- --apply
  ```

  Provisioning uses the existing organization/site IDs, no longer uses
  `metadata.synthetic` to classify the school or its user records, and audits
  changes. It retires the known legacy facilitator and mirrored grants rather
  than reactivating them. It must only be run against the intended development
  or test database.

## Existing-account rollout

Schema migrations do not rename existing account records. The explicit
provisioning command also migrates the four fixed student, teacher, specialist,
and guardian accounts from `@can-os.invalid` to `@valorschool.demo`, after
checking their person and tenant bindings. Registrar/admin email migration is
part of their existing provisioning. Conflicts fail and roll back the complete
operation; email changes write audit and outbox evidence. Retired inactive
grants remain historical records, not a reason to reject the account's sole
active registrar grant.

On 2026-10-20 the operator approved and applied this six-account data repair
to production after a rollback rehearsal on the recovery branch. All six
personas subsequently signed in through the local browser form with `000000`
and reached their ordinary role workspaces. The browser was left signed in as
`admin.demo@valorschool.demo` on Admissions. This verifies local login and
workspace entry only: Admissions had no applications, and the complete school
dataset/workflow acceptance gaps below remain unresolved. Hosted public demo
access was not enabled.

## Applicant access

Families can begin at `/apply` for a program explicitly opened by its registrar
in `/admissions/intake`. New authentic accounts require a single-use email
verification link before applicant access is usable. Configure
`CAN_ACCESS_PUBLIC_ORIGIN` (HTTPS), `CAN_ACCESS_TOKEN_PEPPER`, `RESEND_API_KEY`
and `CAN_ACCESS_FROM_EMAIL` for that delivery path. Registration does not modify
an existing identity from submitted email/name fields: the existing owner signs
in normally and can opt into applicant membership for an open school.

A new Valor School family instead uses a new `@valorschool.demo` email and
`000000`; no email is sent. The domain, code and selected
school are checked on the server. That account can return through `/access`
with the same code. Authentic email addresses cannot register into Valor, and
Valor addresses cannot acquire an applicant membership in another tenant.

The `applicant` role has only `enrollment.apply`. It can save, submit and read
its own scoped applications, but cannot accept offers, view academic records,
manage enrollment, or grant itself a verified guardian relationship. Verification
and guardian provisioning remain separate registrar commands on the same
Person and account. All consequential application commands use the normal
transactional audit/outbox path. New registration is bounded to 100 accounts
per hour across the application; that is not a substitute for deployment-level
abuse controls or a complete public-launch security assessment.

With explicit operator approval on 2026-10-20, online applications were opened
only for Valor's active high-school program, and one synthetic example was
created through the local browser:

- Contact: Taylor Demo, `taylor.family@valorschool.demo`, code `000000`.
- Student: Avery Demo, entering grade 9.
- Application: `9a15ca68-3f22-4520-8cef-5b17f4e07d14`, stage `application`.
- Draft save, reload, edit, unsaved-submit blocking, confirmation and submission
  were exercised, then the same application was observed in the registrar's
  intake and pipeline.
- Read-only database verification confirmed the linked contact household,
  three application audit records, one submission event, no enrollment and all
  pending guardian permissions false. No guardian verification or admission
  decision was fabricated.

This is local browser evidence against approved synthetic records, not hosted
deployment acceptance. Real email challenge redemption is integration-tested
with a mocked sender; actual provider delivery remains unverified. The broader
dataset and cross-workspace acceptance gaps below are unchanged.

## Database-backed test safety

The demo registrar integration tests are not runtime-gated by `DATABASE_URL`.
They run only when launched through the guarded integration-test runner with an
explicit disposable `TEST_DATABASE_URL`. The runner checks that this endpoint
differs from the configured application database endpoint, then sets
`DATABASE_URL` to that test endpoint for the test process. Do not run fixture
tests directly against an application database.

```powershell
$env:CAN_TEST_DB_WRITES_ENABLED = "true"
$env:APP_ENV = "test"
npm run test:integration -- demo-registrar
```

The integration suite is skipped if its guarded test environment is absent.
That skip does not disable or enable a runtime feature.

## Remaining acceptance gaps

Public access must remain disabled in deployments until the following are
complete and verified:

1. Tenant isolation is proven across every read, command, event handler,
   administrative query, analytics path, and background worker.
2. Keep intended environments current with migration
   `0026_charming_dark_beast.sql`, which removes the legacy
   `account_person_grants.is_synthetic` column. Production was migrated and
   verified on 2026-10-20; other branches were not migrated in that rollout.
   Runtime authorization and seed behavior now use tenant scope; any existing
   JSON metadata values are inert and must not classify records.
3. Admin Console dataset status, version, validation, account directory, reset,
   and destructive-operation audit controls are implemented.
4. Deterministic versioned seeds validate relationship integrity, counts,
   provenance, and domain invariants; a guarded reset restores the baseline.
5. Complete persisted cross-persona workflows are tested end-to-end, including
   assignment publication, student submission, grading, guardian reporting,
   analytics, domain events, and authorization denials.
6. Payment and any other consequential external integrations are explicitly
   sandboxed or suppressed for the demo tenant.

Seed scripts currently supply synthetic history, but their static contents do
not certify completeness or operational behavior. No demo-dataset reset or
Admin Console dataset-management capability is currently provided. Do not
represent those capabilities as complete.

## Identity and authorization invariants

1. An account is a login identity; a person is a school-domain identity.
2. A membership/grant binds account, person, role, and tenant scope. Tenant
   switching never changes a person's role or grants access to another account.
3. A server-issued session is opaque, expiring, revocable, and stored hashed.
   Authenticate each request from that session, never from URL parameters,
   localStorage, or client-supplied actor/role IDs.
4. Authorization checks capability, resource, scope, and relationship on the
   server. Hiding a UI control is not authorization.
5. Consequential mutations use the normal audit and domain-event paths. Shared
   persona credentials cannot establish the human identity of a visitor.
6. Do not put authentic student, staff, family, health, legal, or financial
   data in the Valor School tenant.
