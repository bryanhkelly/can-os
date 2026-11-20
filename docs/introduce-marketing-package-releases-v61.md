# Introduce V6.1: atomic Marketing Package Releases

Branch: feature/launch-studio-v61-clean-cutover-20261118

## Product invariant

Establish (Site Story, Program intent, audiences and saved canonical Brand) precedes
Introduce. The Brand version must exist before creating a Marketing Package. An
operator may edit that Package repeatedly, but **Release Package** is a single
atomic operation for every selected output format. Formats are not individually
versioned or independently generated in the Launch Studio UI.

A Package Release is an immutable, frozen set of materials. It contains one
Brand version, one complete package content snapshot, an ordered set of
formats, an originating package revision, creator/time, and linked immutable
SVG/HTML outputs. Each output also retains its exact template and original
rendered bytes/checksum. A mutable working Package is never treated as a
previously released snapshot.

## User journey

1. Establish and save the Site Brand.
2. Introduce: create or edit a Marketing Package using saved Site Story,
   Programs & Audiences, and canonical Brand.
3. Preview selected formats. The preview is read-only and does not publish,
   generate or send anything.
4. Release Package. All selected formats render and persist in the **same
   transaction**, with one release number and one idempotency request ID.
5. Download the entire immutable release ZIP or individual outputs.
6. Later change the working message, audience, formats, title, or explicitly
   select a newer Brand. The UI compares actual content with the latest
   frozen release, not the mutable package revision counter.
7. Preview the updated package and explicitly release a new version. Historical
   files remain unchanged; previously shared/scheduled material is not resent.
8. Archive the Package without deleting its releases.

A release cannot be completed with an invalid selected format or without a
durable authorized QR destination where a QR card is selected. All-or-nothing
means failed material rendering causes the transaction to roll back without
publishing a partially completed Package Release.

## Storage and migration

Migration 0092 adds a parent site_marketing_package_releases table with a
unique (package, release number), a unique (package, request ID), immutable
trigger, exact-Site composite foreign keys, and server-only RLS.

New child site_artifact_releases entries reference the parent by
(package/site/package release). The parent and **all** child records are written
in one database transaction. Legacy artifact records retain a NULL parent and
remain downloadable as earlier standalone material; the immutable artifact
table is not rewritten or destructively backfilled.

The source release endpoint now releases the entire Package and replaces the
single-format generator entry point in the Introduce UI. Existing frozen
artifact read/rights-withdrawal checks are reused.

## ZIP and distribution

The browser ZIP is a deterministic stored-byte archive built from originals
fetched through the existing authorized, checksum-validated release-output
endpoint. It includes the selected output files, social caption if applicable,
and a version manifest listing the parent release, Brand, package revision and
per-artifact SHA-256. No client-side rerendering or access to a newly selected
Brand can alter the contents. If any format is withdrawn/incomplete, the full
ZIP is blocked; unaffected originals remain individually downloadable.

The ZIP function uses a standards-compliant ZIP STORE implementation without
introducing a new file/media dependency. Provider email sending and
distribution/recipient history remain separate authorized operations.

## Acceptance required before deployment

- Apply migrations 0088–0092 in order on an explicitly disposable test DB.
- Test creating one 3-format Package Release and verify exactly one parent
  with three linked children. Confirm forced output/insert failure leaves no
  parent or child.
- Re-send the same request ID and confirm the same parent is returned.
- Change the Package after a successful release and confirm the previous
  snapshot and downloaded bytes are identical.
- Verify cross-Site read/write denial, archived-package release rejection,
  withdrawn media behavior, and QR-destination requirements.
- Run TypeScript, build, unit/visual tests and an authenticated Launch Studio
  journey at representative breakpoints.
- Confirm older individual releases can still be downloaded through the
  historical section, with no duplicate-generation path in the UI.
- Do not apply to production or merge to main before the acceptance gates.

This branch adds code and migration source only. It does not claim that
the migration has been applied or that the complete workflow has passed
authenticated database and browser verification.
