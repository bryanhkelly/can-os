# CAN OS demonstration curriculum factory

Generates **120 original synthetic course entries**, including **15 deeper product walkthroughs** (20 illustrative lessons each) and **105 preview courses** (one lesson each). The content is a demonstration artifact, not a credited or academically reviewed curriculum. No external third-party texts are embedded, so importing it does not assert rights over OER.

## Generate

```bash
node scripts/demo-curriculum-factory.mjs --output /tmp/can-demo-catalog.json --deep 15
```

Output is deterministic and carries an explicit provenance record. The deeper examples show modules, activities, practice and formative evidence, but do not represent a reviewed four-week scope and sequence.

## Import

Use an **isolated Neon database branch** and a dedicated organization named **CAN Demo Publisher** (slug `can-demo-publisher`, type `other_partner`, metadata `demoPublisher: true`, `isSynthetic: true`). The importer rejects any other publisher. Create this organization in the target database before importing. The validation Neon branch already contains it, with UUID `3340246a-4e2d-46cf-aa79-0adaa9feb2c8`.

```bash
DATABASE_URL="<branch-specific connection string>" \
  node --import tsx scripts/import-demo-curriculum.mjs \
  --file /tmp/can-demo-catalog.json \
  --publisher "<can-demo-publisher-uuid>"
```

This is a dry run. To load drafts, set `DEMO_CURRICULUM_ALLOW_WRITE=1` and add `--apply`. Never point the command at a live production database without deliberately reviewing the target and publisher. The importer verifies course content with the existing Zod schema and wraps all records in one transaction. Re-runs with identical input are idempotent by SHA-256 digest and course code. Different input creates new draft versions rather than rewriting published versions.

**No implicit publication or school adoption.** The importer does not create student records, entitlements, enrollments, teacher answer guides, or assignment submissions.

## Identified integration gaps

1. **Marketplace visibility:** the pack is deliberately private/draft. The existing store needs a publisher-authorized demo-preview path before ordinary visitors can browse it.
2. **Publisher review controls:** draft demo lessons should remain distinct from school-of-record credit-bearing materials. A controlled academic review and publish action is needed.
3. **Assignments:** generated student activities are not section-specific gradebook assessments. A separate, idempotent publisher-assessment-template-to-section materialization flow remains necessary.
4. **Teacher guides:** demos currently do not include answer keys; add teacher-only guides via the restricted existing `teacherGuides` field before claiming a complete classroom workflow.
5. **Source ingestion:** this generator authors new, synthetic demos. Importing third-party OER requires item-level rights, attributions, editions and compatibility review.
6. **Deep-course quality:** the 15 deeper demos are 20-day scripted product examples, not academically reviewed instructional sequences.
7. **Target protection:** dry-run and explicit write opt-in are provided, but a further production-target allowlist would be needed for unattended automation.

The current scope intentionally favors safe, deterministic marketplace data over synthetic grades or live-school contamination.
