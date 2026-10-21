# Curriculum marketplace: portability-first architecture

**Implementation snapshot:** This feature branch introduces the canonical pack, installation, adoption, reusable resource, local overlay and interchange-provenance structures, together with a staff marketplace screen and a guarded synthetic ValorSchool fixture. It does **not** yet claim standards conformance or production release readiness.

## Core ownership and delivery boundaries

- **Publisher:** `curriculum_packs` and immutable `curriculum_pack_versions`. Pack items reference existing `course_template_versions`; publishers do not rebuild a duplicate LMS catalog.
- **Organization:** `curriculum_entitlements` records licensed access for one organization; the permission to view, select, or adopt does not constitute redistribution rights.
- **Program/site:** `curriculum_adoptions` pins a published pack version for a particular program (and its existing site). Sections retain their existing `course_template_version_id`; migration never silently repoints active sections.
- **Supplement:** `curriculum_resources` is the reusable asset catalog (PDF/document references, external links, videos, images, audio, app links). `curriculum_resource_bindings` places publisher assets within pack/course/lesson releases. `curriculum_overlays` records organization/program/site/section-specific additions without overwriting publisher material.
- **Private assets:** reuse the existing `documents` and R2-backed authorization boundary. The staff workflow accepts externally hosted HTTPS links, including PDFs and videos. It also supports direct private PDF upload and short-lived authorized class download links using existing R2 and verified documents, gated by `CAN_R2_CURRICULUM_UPLOADS_ENABLED=true` and valid private R2 credentials. Files are limited to 10 MB and checked for size, MIME, and PDF magic bytes. This implementation has not yet received a real storage-endpoint acceptance test.
- **Runtime:** existing `sections`, `enrollments`, `assessments`, `submissions`, `section_grades`, `lesson_progress` remain authoritative. A course can be used without a marketplace pack, as before.

## Standards and adapter contracts (required roadmap, not yet live adapters)

| Standard | Scope | Starting integration contract | Status |
| --- | --- | --- | --- |
| Common Cartridge 1.3 / Thin Common Cartridge | Import/export course outlines, linked content and manifests, preserving source IDs and package files | Ingest safely into staged `curriculum_import_jobs`; validate manifest, media types, resources, version and asset rights; retain external IDs in `curriculum_interop_mappings`; report unmapped resources before publishing | **ZIP manifest validation and audit-staging implemented for packages up to 2 MB; no course conversion, binary-resource installation or exporter yet** |
| Common Cartridge 1.4 candidate final | Future K–12 profile; version-negotiated with the partner | Do not assume compatibility with earlier cartridges; implement upon published final conformance profile | **Future** |
| LTI 1.3 / LTI Advantage | Secure external launch, deep linking, names/roles and assignment/grade services | Per-provider registration, issuer/authorization/JWKS, deployment ID, OIDC launch validation, OAuth2 access tokens, deep links, NRPS, AGS under existing scoped role authorization | **Not implemented** |
| QTI 3.0 | Assessment questions, tests, interactions and scoring | Import/export portable assessment packages; do not flatten inaccessible or unsupported question types; isolate grading keys, publish versioned templates, map to existing assessments/submissions | **Not implemented** |
| OneRoster 1.2 (CSV and REST) | Rosters, enrollment, courses, grade exchange, class resources | Map sourced identifiers to canonical Person, Section, Enrollment and Grade; differential sync with preview, collision prevention, cross-school scope checks and audit | **Not implemented** |
| CASE | Machine-readable competency/standards identifiers | Preserve external `sourcedId` or GUID and jurisdiction/version with alignment records | **Planned** |

Standards reference: https://www.1edtech.org/standards/cc ; https://standards.1edtech.org/lti/guides/implementation_guide/implementation-guide ; https://www.1edtech.org/standards/qti/accessibility ; https://standards.1edtech.org/oneroster/specifications/standards/v1p2 .

**Portability rule:** exported content must retain external identifiers, ordering, rights/attribution, resource references and explicit loss reports. A nonportable CAN-only field must be stored in a namespaced extension; it may not silently replace or erase standards-native metadata.

## ValorSchool synthetic fixture

`scripts/seeds/valor-curriculum-marketplace.sql` requires **an isolated database branch**, migrations 0026/0027, and `SET can.seed_authorized='valorschool'` in the same session. It verifies the existing organization, program and `@valorschool.demo` identities, and creates a **32-course preview catalog** and four introductory courses with section assignments. The preview is original synthetic content only and **is not credit-ready or a substitute for an approved 36-week curriculum**. The seed uses `DEMO-INTERNAL` rights and stores only an external link to the National Archives.

No distinct account, organization or demo-only route is created. The existing ValorSchool registrar, student and teacher relationships are reused.

## Acceptance gates

1. Additive migrations and Drizzle-generated snapshots must be reconciled and applied on a disposable Neon branch before live use.
2. Test capability + organization + site + program authorization on reads, installs, adoptions and overlays; test revoked entitlements and unauthorized cross-school access.
3. Test stable course-version pointers and unchanged grades/completions when a pack is adopted.
4. Test protected resource downloads and PDF signature verification before enabling direct-upload UI.
5. Run TypeScript, unit/integration, migration parity, and browser golden flows on the exact PR head. Do not imply certification, accreditation or production acceptance from fixtures alone.

**Current release status:** Marketplace schema and 32-course synthetic preview pack are installed in the ValorSchool demo organization. Its four illustrative class sections use existing teacher and student identities. New PDF upload and Common Cartridge manifest-validation handlers have passed CI but remain gated/await operational acceptance. Common Cartridge course conversion, full QTI/OneRoster/LTI interoperability and 36-week curricular depth remain unfinished and must not be represented as standards-conformant or credit-ready.

## October 21, 2026 implementation update

- `src/domain/common-cartridge.ts` can inspect bounded IMSCC ZIP archives, validate the `imsmanifest.xml` resource IDs, preserve the course outline and report unsupported QTI/LTI entries. It rejects path traversal, ZIP64/encrypted archives, oversized or corrupted manifest content, and XML external entities. The authenticated registrar can stage a **validation report**, not publish a converted course. This is intentionally not claimed as 1EdTech certification.
- `src/modules/learning/curriculum-resource-upload.functions.ts` signs resource-scoped private PUTs, verifies actual PDF objects, records the resource/document/overlay atomically and audits the action. The classroom download command checks current enrollment/teacher/guardian relationships before signing a GET. Uploads fail closed without the explicit environment gate.
- Neither the Common Cartridge validator nor the upload flow changes grades, enrollments, school records or published source course versions.
- R2 e2e, large-cartridge resource ingestion, QTI question/answer-key mapping, LTI 1.3 registration/launch/AGS, and OneRoster class/grade exchange are still **required work**, not completed capabilities.
