# CAN OS Documentation

This is the new authoritative documentation entry point. The FullFlow delivery initiative has been released and retired. Archived delivery notes are historical evidence, not active instructions.

## Read in order

1. [CAN vision](vision/CAN-VISION.md): institutional model and product intent.
2. [Platform capabilities](product/PLATFORM-CAPABILITIES.md), [operating model](product/OPERATING-MODEL.md), [School Launch and Run](product/LAUNCH-AND-RUN.md), [Website Studio](product/WEBSITE-STUDIO.md), and [Website Media](product/WEBSITE-MEDIA.md), and [Public Sites and Admissions](product/PUBLIC-SITES-AND-ADMISSIONS.md), and [Academic Delivery](product/ACADEMIC-DELIVERY.md), [Extended Learning](product/EXTENDED-LEARNING.md), and [Site Operations](product/SITE-OPERATIONS.md): product scope, institutional boundaries, launch journeys, and imagery rights.
3. [Design authority](design/README.md): approved V6.1 direction, reusable components and adoption requirements.
4. [System architecture](architecture/SYSTEM.md), [domain model](architecture/DOMAIN-MODEL.md), and [acceptance standards](quality/ACCEPTANCE-STANDARDS.md), and [public-site release gates](quality/PUBLIC-SITE-RELEASE-GATES.md).
5. [Engineering operations and security](engineering/OPERATIONS-AND-SECURITY.md): retained runbooks and dependencies.
6. [Documentation inventory](DOCUMENT-INVENTORY.md): verified classifications and dependency gates.
7. [Product and architecture migration register](DOCUMENTATION-RESET.md): what is canonical, pending review, and historical.
8. [Root agent contract](../AGENTS.md): existing engineering and security invariants, pending reconciliation.
9. Current source code, migrations, and executed tests: evidence of implemented behavior.

## Authority rules

- Product intent is not inferred from incomplete code.
- Implementation status is not inferred from aspirational product documents.
- Security, privacy, migration, deployment, and recovery guidance must be retained and verified before an active source is retired.
- Do not implement directly from `docs/archive/` without revalidation.
- No release initiative, including FullFlow, is permanently authoritative for CAN OS.

## Migration status

**In progress.** The existing documentation has not yet been comprehensively inventoried or archived. Until that work is complete, existing technical and safety guidance remains applicable where not contradicted by verified current code or an explicit approved decision. See [reset register](DOCUMENTATION-RESET.md).

Historical branch handoffs, release evidence and retired FullFlow plans live under [the November 2026 archive index](archive/2026-11-fullflow/README.md). These records are not current implementation or release authority.

## Documentation maintenance

Run `npm run docs:check` before changing or moving documentation. The CI check validates tracked local Markdown link destinations in active documentation (including the historical archive index) and explicit `docs/*.md` or `docs/*.json` references in source and workflow files. Historical archive document bodies are deliberately excluded because their original links are preserved as evidence. Remote URLs, heading anchors, unlinked prose paths, and runtime behavior are outside this check's scope.
