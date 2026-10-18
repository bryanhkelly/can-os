# Historical feature-track identifiers

The formal Golden Flow catalog is [golden-flows.md](./golden-flows.md). Previous development notes used additional **implementation-track labels**, without adding corresponding formal flow specifications to the canonical catalog:

| Historical label | Meaning | Current owner to inspect |
| --- | --- | --- |
| GF40 | Course selection, registration, add/drop and withdrawal | `src/modules/learning/` and student/guardian/registrar course routes |
| GF41 | Student support referrals | `src/modules/support/` and authorized support routes |
| GF41B | Support plans and services | `src/modules/support/` |

These identifiers remain in some fixture/test filenames and archived records for traceability. They are **not** newly approved Golden Flows. Do not silently renumber existing database events, tests, APIs or files; create a reviewed canonical flow specification and acceptance criteria if formalizing them.

Historical versions: [October 2026 archive](./archive/2026-10/).
