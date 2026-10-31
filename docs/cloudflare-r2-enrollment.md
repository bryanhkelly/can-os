# Private Cloudflare R2 enrollment and learning documents

CAN OS stores document bytes in a private Cloudflare R2 bucket and metadata in the canonical `documents` Postgres table. Raw storage keys and signing credentials must never be exposed to unauthorized users. Application, student, guardian, school, program and current journey relationships are checked on the server before granting upload or download access.

## Deployment configuration (server-only)

| Variable | Purpose |
|---|---|
| `CAN_R2_ACCOUNT_ID` | 32-character Cloudflare account ID |
| `CAN_R2_BUCKET` | Private bucket name |
| `CAN_R2_ACCESS_KEY_ID` | Bucket-restricted key |
| `CAN_R2_SECRET_ACCESS_KEY` | Secret for signing object-specific URLs |
| `CAN_R2_DEMO_UPLOADS_ENABLED=true` | Enables document uploads on explicitly synthetic enrollment records only |
| `CAN_R2_LIVE_UPLOADS_ENABLED=true` | Explicitly enables authenticated live enrollment document uploads |
| `CAN_R2_QUALIFICATION_UPLOADS_ENABLED=true` | Separately enables authenticated teacher qualification evidence uploads after operational review |
| `CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED=true` | Separately enables authenticated church school-opening evidence uploads after operational review |

**All upload switches default to false.** Demo uploads also require the separate `CAN_DEMO_WRITES_ENABLED` gate. They must never be used as replacements for role and resource authorization. Use a token with access restricted to one private bucket, never put credentials in `VITE_` variables, and restrict CORS to approved application origins and the exact upload headers/methods. CORS does not confer authorization.

## Enrollment workflow

The `beginEnrollmentDocumentUpload`, `finishEnrollmentDocumentUpload`, and `getEnrollmentDocumentDownload` functions expose the canonical API directly; unused synthetic-named aliases have been retired. The server checks active registrar/guardian identity, site/program membership and, for guardians, enrollment-management authority for the named child. A two-stage upload validates an allowed PDF, JPEG or PNG (16 bytes–10 MB), binds a three-minute PUT URL to the application and requirement, and checks the uploaded object's HEAD length and MIME type and a bounded 16-byte signature. The finish command rechecks the open journey/requirement and stores a versioned, restricted document and audit history. Registrars can review and approve/reject verified documents; linked guardians receive rejection/request notifications.

Downloads require fresh authorization on each request and return a short-lived private GET URL. Archived completed journeys remain readable to authorized actors; new writes to them are prohibited.

The guardian uses the existing `/guardian/admission-offers` workspace's
**View enrollment checklist** control. A document request/rejection notice
opens `?student=<personId>&application=<applicationId>` directly. The checklist
shows family-visible correction instructions, current verified downloads and
superseded file history without internal notes or storage keys. Uploads remain
separately gated for synthetic and live applications. If disabled, the page
explicitly directs the family to admissions instead of showing a fake upload.

Both guardian and registrar forms retain an uploaded object's key for an
in-page finish retry after a successful PUT. Changed recorded metadata is
rejected. Finish rechecks current managing-guardian authority inside its
transaction, resets readiness for review and writes `EnrollmentDocumentSubmitted`
alongside audit evidence. Registrar request/reject/approve decisions append
`EnrollmentDocumentReviewed`; identical retries do not duplicate evidence or
notices. A pending document cannot be completed with the generic checklist.
Superseded and unverified files cannot receive download links; acceptance
requires the current storage-verified file (or an explicitly synthetic fixture).

The `admissions-offers` isolated integration mode now exercises request,
upload registration, rejection, replacement, approval and activation, including
storage-verification failure and atomic rollback on outbox failure. Signing
and object verification are mocked: this is not live R2 or browser acceptance.
No upload switches, production grants or bucket configuration were changed.

Configured enrollment forms are a separate requirement interaction inside the
same Journey, not an upload or signature inferred from a file. One managing
guardian explicitly acknowledges the school's configured statement and signs
the form; a registrar reviews it. A required form cannot be satisfied by
uploading a signed PDF or approving another document through these APIs.
No external signature provider, legal certification or live-storage acceptance
is implied by the in-app signature record.

## Church school-opening evidence

The launch workspace and CAN authorization desk use the same five canonical
Program-bound opening-evidence categories. A verified church registrar with the
exact Organization/Site/Program relationship can submit a private PDF, JPEG or
PNG against the current SchoolConfigurationVersion. The server rechecks that
relationship and configuration while holding the Program lock, verifies the
private object, increments the category version, and preserves every superseded
Document and review reason. Conditional creation prevents an upload retry from
replacing bytes at the same key; finish retries are idempotent.

A separately verified CAN steward reviews the current submitted version. The
uploader cannot verify their own document, and the final opening approver must
also differ from the evidence verifier. Approval and rejection record a reason,
transactional AuditEvent and DomainEvent/outbox fact. A rejected, expired or
newly pending latest version blocks opening and subsequent guarded onsite
presence without deleting prior evidence. The read model identifies the precise
category status, responsible owner and next action; short-lived downloads are
reauthorized and audited for both church and CAN readers.

Uploads use `school-opening/{programId}/{uuid}` keys and the separate default-off
switch above. Live R2, bucket CORS/conditional writes, malware quarantine and
authenticated multi-role browser/Neon acceptance remain unverified. Enabling the
switch does not certify jurisdiction-specific legal compliance or school opening.

## Learning and attendance attachments

Assignment submissions and guardian attendance excuses use `learning/assignment/{assessmentId}/{uuid}` and `learning/excuse/{attendanceEventId}/{uuid}` keys. They require authentic student enrollment or current guardian-child permission, respectively. Presigned upload requests create a pending metadata record with a 24-hour authorization expiry. A document can be attached only after a matching R2 HEAD and bounded file-signature verification. The record is then marked verified. Download URLs expire after 60 seconds and require current student/guardian ownership of the linked submission or excuse.

## Release and operational gates

### Qualification evidence

Teacher self-submission uses `qualifications/{personId}/{claimId}` object keys,
the canonical qualification claims/review history and restricted Documents.
The begin command requires a current scoped teacher role; finish rechecks that
affiliation and validates size, MIME and a bounded magic-byte read before
atomically persisting the claim, Document, pending review, audit and outbox.
Retried finish requests use the same claim/key and do not duplicate records;
conflicting metadata is rejected. An uploaded-but-unconfirmed submission can
be retried in the same page without uploading again.

These uploads opt into signed `If-None-Match: *` conditional creation so a
still-valid upload URL cannot replace submitted evidence at the same key.
The browser must send the headers returned by the begin command. Bucket CORS
must allow `Content-Type` and `If-None-Match` for PUT from approved origins.
Cloudflare documents atomic conditional creation in its
[S3 compatibility reference](https://developers.cloudflare.com/r2/api/s3/api/).
This signing option is opt-in and does not change existing enrollment,
profile-photo or learning upload behavior.

Independent reviewers must have the explicit database-backed verifier grant
and institution/scope relationship, not merely registrar or policy-publisher
status. Short-lived evidence GET links are freshly authorized and audited.
Storage verification is not human qualification approval or malware clearance.
The qualification upload gate must remain disabled until live-bucket
conditional-write/CORS, privacy, quarantine, retention and abandoned-object
cleanup gates are accepted. No automatic deletion of abandoned bytes is claimed.

This implementation has **not** been validated against a live R2 bucket. Before enabling live uploads, complete a security/privacy review including anti-malware scanning/quarantine, actual bucket CORS and least-privilege credentials, object expiration/deletion of abandoned uploads, retention/legal holds and records export, access revocation, denial tests across former guardians and schools, audit delivery, and a controlled rollback procedure. Restrict supported MIME types to the currently server-verifiable PDF/JPEG/PNG formats; other office document formats must not be enabled merely by changing the browser file picker.

Production school document access remains a deployment decision; passing source review or setting the upload switch does not mean these operational gates were completed.
