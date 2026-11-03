# Content ingestion readiness

## Intake pipeline
1. Identify publisher organization by immutable UUID. Do not attach a per-record demo flag.
2. Validate `curriculumIntakeSchema` in `src/domain/curriculum-intake.ts`, including duplicate codes and source rights.
3. Stage source artifacts and record source identity, license, attribution, edition and permission evidence.
4. Normalize content into `classContentSchema` and teacher-only guide schema. Quarantine invalid content and produce an actionable import report.
5. Upsert course templates within publisher scope; compute **per-course** normalized content hashes and create new immutable draft versions only when content changes.
6. Assemble draft packs and versions, preserving publisher ownership and version references.
7. Review and publish content through existing authorization workflows.
8. Apply internal academic approval per curriculum version, jurisdiction and academic purpose, with status, effective dates, authority and evidence.
9. Allow program adoption only through existing entitlement and approval gates. Section schedules and delivery configuration are downstream.

## Demo policy
CAN Demo Publisher is the synthetic publisher. The guarded reconciliation creates `under_review` records for its 120 draft course versions across eight configured jurisdictions. These are review-queue records, not approvals. Preserve existing decisions and never imply government approval or credit authorization. The current legacy pack requires the controlled provenance reconciliation documented in [the demo catalog procedure](./demo-catalog-factory.md) before import.

## Readiness blockers
- The importer has per-course content hashes and a manifest-wide pack hash; two full identical runs still need execution against a disposable branch.
- The draft pack is not discoverable through the ordinary marketplace.
- Jurisdiction reconciliation and the separate profile reviewer workflow are implemented in code, but the live database migration and reviewer/publication acceptance have not been executed for this change.
- Ingestion requires a durable staging/reporting path and licensed content review.
- Teacher guides, assessment blueprints and end-to-end classroom adoption still need integration.

Do not turn on unattended external-source ingestion until rights checks, importer idempotency, review gates and target environment protections are verified.
