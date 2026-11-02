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
CAN Demo Publisher is the synthetic publisher. All 120 demo course versions should be approved for all supported jurisdictions in the **demo environment** via normal approval records. Approval reconciliation is needed for new jurisdictions and new course versions. Never imply government approval or credit authorization.

## Readiness blockers
- The initial importer is demo-specific and uses a manifest-wide hash, not per-course hashes.
- The draft pack is not discoverable through the ordinary marketplace.
- Jurisdiction approval records and automatic demo reconciliation are not implemented.
- The state profile and its school-launch projection are specified but not implemented.
- Ingestion requires a durable staging/reporting path and licensed content review.
- Teacher guides, assessment blueprints and end-to-end classroom adoption still need integration.

Do not turn on unattended external-source ingestion until rights checks, idempotency, review gates and target environment protections are verified.
