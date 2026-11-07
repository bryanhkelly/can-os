# CAN OS Documentation

This is the new authoritative documentation entry point. The FullFlow delivery initiative has been released and retired. Archived delivery notes are historical evidence, not active instructions.

## Read in order

1. **Purpose and ownership:** [CAN Vision](vision/CAN-VISION.md), [Platform Capabilities](product/PLATFORM-CAPABILITIES.md), and [Operating Model](product/OPERATING-MODEL.md).
2. **Launch and family:** [School Launch and Run](product/LAUNCH-AND-RUN.md), [Launch Studio Audiences](product/LAUNCH-STUDIO-AUDIENCES.md), [Website Studio](product/WEBSITE-STUDIO.md), [Website Media](product/WEBSITE-MEDIA.md), and [Public Sites and Admissions](product/PUBLIC-SITES-AND-ADMISSIONS.md).
3. **Teaching and operating:** [Academic Delivery](product/ACADEMIC-DELIVERY.md), [Extended Learning](product/EXTENDED-LEARNING.md), and [School and Site Operations](product/SITE-OPERATIONS.md).
4. **Architecture and design:** [System](architecture/SYSTEM.md), [Domain Model](architecture/DOMAIN-MODEL.md), and [Design Authority](design/README.md).
5. **Required safety and acceptance:** [Acceptance Standards](quality/ACCEPTANCE-STANDARDS.md), [Church-Hosted Safety Gates](quality/CHURCH-HOSTED-SAFETY-GATES.md), [Public Site Release Gates](quality/PUBLIC-SITE-RELEASE-GATES.md), and [Engineering Operations and Security](engineering/OPERATIONS-AND-SECURITY.md).
6. **Engineering policy:** [Agent Contract](../AGENTS.md); current code, migrations, and **executed** tests are implementation evidence.
7. **Migration provenance:** [Inventory and Audit Log](DOCUMENT-INVENTORY.md), [Reset Register](DOCUMENTATION-RESET.md), and [Historical Archive](archive/2026-11-fullflow/README.md).

## Authority rules

- Product intent is not inferred from incomplete code.
- Implementation status is not inferred from aspirational product documents.
- Security, privacy, migration, deployment, and recovery guidance must be retained and verified before an active source is retired.
- Do not implement directly from `docs/archive/` without revalidation.
- No release initiative, including FullFlow, is permanently authoritative for CAN OS.

## Migration status

**In progress, with a complete tracked-file tree inventory and an automated path-reference gate.** Superseded FullFlow plans are progressively archived while source-verified product, architecture, design, quality and engineering references are rebuilt. Several active technical and safety documents still require reconciliation; do not treat the migration as finished or relax existing operational security gates. See [reset register](DOCUMENTATION-RESET.md).

Historical branch handoffs, release evidence and retired FullFlow plans live under [the November 2026 archive index](archive/2026-11-fullflow/README.md). These records are not current implementation or release authority.

## Documentation maintenance

Run `npm run docs:check` before changing or moving documentation. The CI check validates tracked local Markdown link destinations in active documentation (including the historical archive index) and explicit `docs/*.md` or `docs/*.json` references in source and workflow files. Historical archive document bodies are deliberately excluded because their original links are preserved as evidence. Remote URLs, heading anchors, unlinked prose paths, and runtime behavior are outside this check's scope.
