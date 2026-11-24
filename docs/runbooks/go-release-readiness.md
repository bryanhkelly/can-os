# Go release readiness

One external entry route: `/go/:code`. Website preview snapshots are immutable private R2 artifacts; the canonical link record owns availability, schedule and revocation. The legacy token route and Site metadata lifecycle are retired.

## Exact revision evidence

From a clean checkout of the release branch with Node and locked dependencies:

```sh
npm run verify:release -- --profile=go --install
```

A source-only run intentionally returns NO-GO because database and browser gates are not established. The runner records the commit SHA and each actual pass, failure or blocked check in a JSON file outside the checkout. It never deploys, migrates or seeds production.

Use the actual deployment DATABASE_URL (never paste credentials in reports) with --database. For isolated browser fixtures, use TEST_DATABASE_URL, APP_ENV=test, NODE_ENV=test, CAN_TEST_DB_WRITES_ENABLED=true, CAN_APPLICATION_DB_HOST and the existing branch attestation configuration. Production schema reads use DATABASE_URL; browser writes use TEST_DATABASE_URL and the existing guard refuses the application endpoint.

Run with --live and CAN_LIVE_PREVIEW_CODE set to a dedicated revocable Go preview code. The test checks anonymous page navigation, headers and rendered images. Never include the code in evidence, logs, issue reports or screenshots. Use CAN_LIVE_BASE_URL only from the approved host allowlist.

## Operator acceptance

- Create a saved Website & Brand preview with no expiration; confirm exactly one canonical Go Link.
- Retry the identical request after an interrupted response; no duplicate link or artifact reference.
- Verify the link appears in authorized Go Link Management and the Website & Brand modal.
- Open from a new browser context and traverse every page. No sign-in, private affiliations or operational forms.
- Edit the saved website; the distributed snapshot must remain unchanged.
- Pause, resume and revoke in the shared registry; every page must enforce current state.
- Withdraw a Brand asset right; all Site preview links must fail closed. Concurrent render issuance must recheck Site revision.
- Verify both cross-tenant denial and wrong-destination creation denial.
- Verify observations do not imply registration, unique people or participation.
- Verify deployment provenance independently; a live test alone cannot prove which commit is deployed.

## Database boundary

The existing deployment schema guard expects a trusted server connection with BYPASSRLS. Anonymous and authenticated database roles must not receive direct access. This is not the same as a least-privilege runtime role. A restricted Go runtime connection and scoped policies/functions require a separate reviewed migration and acceptance test; never simply revoke the current application's privileges on production.

## Release decision

A skipped build is not a pass. A source-only validation, unknown-code 404 or successful snapshot rendering does not prove issuance, revocation or tenant isolation. Do not mark the release ready until the exact deployed build, database permission checks and operator acceptance are recorded.
