# Admissions Neon acceptance — environment handoff

The existing workflow at `.github/workflows/admissions-integration.yml` runs under the GitHub Actions environment `integration-test`.

Configure these **environment-scoped** values before dispatching acceptance:

| Name | Kind | Purpose |
| --- | --- | --- |
| `CAN_ADMISSIONS_TEST_DATABASE_URL` | Secret | Connection URL for an approved disposable Neon database branch, not the production branch |
| `CAN_APPLICATION_DB_HOST` | Variable | Hostname of the production application database, used to reject accidental production writes |
| `CAN_ADMISSIONS_TEST_BRANCH_ID` | Variable | Exact ID of the approved nonproduction Neon branch |

Do not copy these values into source, logs, or pull requests. The repository workflow already fails closed when any is missing.

The required acceptance order is: configuration preflight, database endpoint verification, Neon project/branch attestation, migrations on the disposable branch, connected admissions integration tests, authenticated Playwright admissions tests.

**Integration-owner action:** verify the Neon branch's project, parent, lifecycle, data sensitivity and disposability before approving its use; configure the environment values with repository administrators. Branch existence or a matching hostname alone is not proof of safety.

**Current status:** Environment values and database identity were not available to this agent. No database migrations or connected acceptance tests were executed. Do not interpret this document as acceptance approval.
