# WS03 — Organization & Launch Studio

This increment moves 39 existing governed workflow adapters and nine controllers (including Site creation) into domain-owned registration, adds a read-only Site geography operation backed by existing exact-Site reporting authorization, and adds HTTP and SDK compile-time regression coverage. It does not change the database schema, authorization semantics, existing REST paths or V6.1 components. Geography returns source/version and market facts, not claims of authority or ACS profiles.

## Release gates still outstanding

- Execute API build, canonical bundle, HTTP tests, OpenAPI export, SDK generation and SDK check in a real checkout.
- Verify authenticated tenant isolation, revisions, replay, concurrent writes and RLS against isolated QA database. Exercise cross-Site denials and absence of geography without fabricating a market.
- Inventory organization lifecycle/provisioning and remaining Launch Studio server functions (including UI loaders, asset/media operations, public preview resolution, facilities and generation); migrate missing APIs and browser/SSR transport with WS01/WS11. Existing TanStack routes are retained until same-origin ingress and runtime parity are proven.
- Coordinate shared identity module/provider and composition seam with WS02. No second identity provider or bypass.
- Execute both pilot journeys via standard authenticated REST and complete V6.1 regression testing before integration/production approval.
