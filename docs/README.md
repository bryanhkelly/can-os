# CAN OS Documentation

This is the new authoritative documentation entry point. The FullFlow delivery initiative has been released and retired. Archived delivery notes are historical evidence, not active instructions.

## Read in order

1. [CAN vision](vision/CAN-VISION.md): institutional model and product intent.
2. [Platform capabilities](product/PLATFORM-CAPABILITIES.md) and [operating model](product/OPERATING-MODEL.md): product scope and institutional boundaries.
3. [System architecture](architecture/SYSTEM.md), [domain model](architecture/DOMAIN-MODEL.md), and [acceptance standards](quality/ACCEPTANCE-STANDARDS.md).
4. [Documentation inventory](DOCUMENT-INVENTORY.md): verified classifications and dependency gates.
5. [Product and architecture migration register](DOCUMENTATION-RESET.md): what is canonical, pending review, and historical.
6. [Root agent contract](../AGENTS.md): existing engineering and security invariants, pending reconciliation.
7. Current source code, migrations, and executed tests: evidence of implemented behavior.

## Authority rules

- Product intent is not inferred from incomplete code.
- Implementation status is not inferred from aspirational product documents.
- Security, privacy, migration, deployment, and recovery guidance must be retained and verified before an active source is retired.
- Do not implement directly from `docs/archive/` without revalidation.
- No release initiative, including FullFlow, is permanently authoritative for CAN OS.

## Migration status

**In progress.** The existing documentation has not yet been comprehensively inventoried or archived. Until that work is complete, existing technical and safety guidance remains applicable where not contradicted by verified current code or an explicit approved decision. See [reset register](DOCUMENTATION-RESET.md).
