# CAN OS stabilization: authorization, academic writes, navigation, notifications

## Production safety

The current repository has synthetic personas but **no authenticated role identity**. All synthetic server-side mutations are now fail-closed in `NODE_ENV=production`. A private **non-production** development environment must explicitly set `CAN_DEMO_WRITES_ENABLED=true` to exercise write flows. `assertSyntheticMutation(role)` identifies which role a given operation requires; it **does not authenticate the caller**. Never enable it with real student records or on a publicly writable demonstration.

Real role enforcement still requires sessions and an authenticated server-side person/role/Site lookup. A front-end persona selector is navigation only, not security.

## Workflow integrity

- Assignment drafts and final submissions perform conditional status writes and lock the existing attempt when it is read in a transaction. A stale draft cannot overwrite a submission already marked submitted. If a concurrent state change occurs, return an error instead of claiming success.
- Registrar approvals lock the request and selected course, recheck the current deadline, and serialize seat availability checks on the section row. Prerequisite-dependent approval now fails closed until verified completion evidence is modeled; an active course is **not** proof of completion.
- Enrollment assignment and referral smoke tests are opt-in when `DATABASE_URL` is configured. They read the existing synthetic fixture database; they do not write or exercise mutation concurrency. A disposable Neon branch is required to add automated transactional race tests.

## Navigation and communication

A shared application navigation and demo persona dropdown appear on all routes. Student notifications now link to an exact assignment or referral record when supported. Opening an assignment can preselect the record, and teacher referral entry points can carry an assessment identifier into a prefilled academic referral.

## Release boundaries

- The workflow tests validate relational fixture integrity only; they do not assert complete cross-role browser behavior.
- Authenticated production writes remain intentionally disabled.
- Existing mutation controls may display server rejection on deployed public sites until they are integrated with real authentication.
- No schema migrations and no real student data.
