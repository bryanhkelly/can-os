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

**Both upload switches default to false.** Demo uploads also require the separate `CAN_DEMO_WRITES_ENABLED` gate. They must never be used as replacements for role and resource authorization. Use a token with access restricted to one private bucket, never put credentials in `VITE_` variables, and restrict CORS to approved application origins and the exact upload headers/methods. CORS does not confer authorization.

## Enrollment workflow

The `beginEnrollmentDocumentUpload`, `finishEnrollmentDocumentUpload`, and `getEnrollmentDocumentDownload` functions expose the canonical API; older synthetic-named exports are temporarily maintained as compatibility aliases. The server checks active registrar/guardian identity, site/program membership and, for guardians, enrollment-management authority for the named child. A two-stage upload validates an allowed PDF, JPEG or PNG (16 bytes–10 MB), binds a three-minute PUT URL to the application and requirement, and checks the uploaded object's HEAD length and MIME type and a bounded 16-byte signature. The finish command rechecks the open journey/requirement and stores a versioned, restricted document and audit history. Registrars can review and approve/reject verified documents; linked guardians receive rejection/request notifications.

Downloads require fresh authorization on each request and return a short-lived private GET URL. Archived completed journeys remain readable to authorized actors; new writes to them are prohibited.

## Learning and attendance attachments

Assignment submissions and guardian attendance excuses use `learning/assignment/{assessmentId}/{uuid}` and `learning/excuse/{attendanceEventId}/{uuid}` keys. They require authentic student enrollment or current guardian-child permission, respectively. Presigned upload requests create a pending metadata record with a 24-hour authorization expiry. A document can be attached only after a matching R2 HEAD and bounded file-signature verification. The record is then marked verified. Download URLs expire after 60 seconds and require current student/guardian ownership of the linked submission or excuse.

## Release and operational gates

This implementation has **not** been validated against a live R2 bucket in the Phase 1 workstream. Before enabling live uploads, complete a security/privacy review including anti-malware scanning/quarantine, actual bucket CORS and least-privilege credentials, object expiration/deletion of abandoned uploads, retention/legal holds and records export, access revocation, denial tests across former guardians and schools, audit delivery, and a controlled rollback procedure. Restrict supported MIME types to the currently server-verifiable PDF/JPEG/PNG formats; other office document formats must not be enabled merely by changing the browser file picker.

Production school document access remains a deployment decision; passing source review or setting the upload switch does not mean these operational gates were completed.
