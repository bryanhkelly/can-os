# Private Cloudflare R2 enrollment and learning documents

CAN OS stores document bytes in a private Cloudflare R2 bucket and metadata in the canonical `documents` Postgres table. Raw storage keys and signing credentials must never be exposed to unauthorized users. Application, student, guardian, school, program and current journey relationships are checked on the server before granting upload or download access.

## Deployment configuration (server-only)

| Variable | Purpose |
|---|---|
| `CAN_R2_ACCOUNT_ID` | 32-character Cloudflare account ID |
| `CAN_R2_BUCKET` | Private bucket name |
| `CAN_R2_ACCESS_KEY_ID` | Bucket-restricted key |
| `CAN_R2_SECRET_ACCESS_KEY` | Secret for signing object-specific URLs |
| `CAN_R2_DEMO_ACCOUNT_ID`, `CAN_R2_DEMO_BUCKET` | Separately configured account and isolated private bucket for demo-tenant enrollment documents |
| `CAN_R2_DEMO_ACCESS_KEY_ID`, `CAN_R2_DEMO_SECRET_ACCESS_KEY` | Credentials restricted to the isolated demo enrollment bucket; no fallback to live credentials |
| `CAN_R2_DEMO_UPLOADS_ENABLED=true` | Enables document uploads on explicitly synthetic enrollment records only |
| `CAN_R2_LIVE_UPLOADS_ENABLED=true` | Explicitly enables authenticated live enrollment document uploads |
| `CAN_R2_QUALIFICATION_UPLOADS_ENABLED=true` | Separately enables authenticated teacher qualification evidence uploads after operational review |

**All upload switches default to false.** Demo uploads also require the separate `CAN_DEMO_WRITES_ENABLED` gate. They must never be used as replacements for role and resource authorization. Use a token with access restricted to one private bucket, never put credentials in `VITE_` variables, and restrict CORS to approved application origins and the exact upload headers/methods. CORS does not confer authorization.

## Shared upload contract

All upload endpoints (assignment, attendance, profile photo, enrollment and
qualification evidence) use `createPrivateUpload` in
[`src/platform/storage/r2.ts`](../src/platform/storage/r2.ts). It returns one
`PrivateUpload` contract containing the `objectKey`, `uploadUrl`,
`uploadHeaders` and `expiresAt`; callers must use those headers unchanged.
Conditional creation adds `If-None-Match: *` to both the signature and the
returned headers in the same factory.

Every browser upload uses `PrivateUploadCompletion`, `uploadPrivateFile` and
the shared file-validation primitives in
[`src/platform/storage/private-upload.ts`](../src/platform/storage/private-upload.ts).
The transport performs only the PUT, omits application credentials, supports
AbortSignal cancellation, and reports HTTP and network/CORS failures
consistently. Completion sessions retain a confirmed stored object when its
domain finish command fails, so a retry repeats only the authorized finish
command and never uploads that object again. Failed/ambiguous PUTs are not
automatically retried; a lost conditional-PUT response must not trigger an
overwrite or make an HTTP 412 look successful.

Domain begin/finish commands still own capability/resource/scope/relationship
authorization, allowed formats/size, key policy, storage namespace, deployment
gates, verification, persistence, audit and events. A successful PUT alone
never confirms a business submission. The common transport does not introduce
a second document lifecycle or relax the existing gates.

Bucket CORS must allow PUT with both `Content-Type` and `If-None-Match` for
approved application origins to support all upload policies. Verify the actual
live or demo bucket before enabling uploads with
`npm run check:r2-cors -- https://<approved-origin> live` (or `demo`). The
check performs only an OPTIONS preflight and fails unless that bucket allows
the origin, PUT, and both signed upload headers. It does not create an object,
modify bucket configuration, or bypass a rejected preflight.

The shared-contract refactor was validated locally on 2026-11-01 with typecheck,
production build, the route inventory checker, 72 focused unit tests, and six
isolated integration tests across class participation, admissions and staffing.
After the refactor, Playwright again passed actual profile-photo, assignment
and guardian attendance uploads through their UI, including reload and verified
Document persistence. The three synthetic R2 objects were removed and their
absence checked; disposable fixture access was retired. Enrollment/qualification
live UI acceptance and the conditional-upload CORS blocker described below
remain separate from this code validation.

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

The local live-bucket checks below do **not** certify production document workflows. Before enabling live uploads, complete a security/privacy review including anti-malware scanning/quarantine, actual bucket CORS and least-privilege credentials, object expiration/deletion of abandoned uploads, retention/legal holds and records export, access revocation, denial tests across former guardians and schools, audit delivery, and a controlled rollback procedure. Restrict supported MIME types to the currently server-verifiable PDF/JPEG/PNG formats; other office document formats must not be enabled merely by changing the browser file picker.

Production school document access remains a deployment decision; passing source review or setting the upload switch does not mean these operational gates were completed.

## Local upload verification - 2026-11-01

Executed against HEAD `2d356260` with pre-existing local worktree changes.
These results describe that local configuration, not a deployed release.

- Chromium/Playwright UI tests passed for a student profile PNG upload and image
  rendering after reload, assignment PDF submission with a storage-verified
  document association after reload, and a guardian PDF attendance attachment
  after a staff-recorded absence and guardian excuse. These tests used authentic
  synthetic sessions and the separately guarded disposable database, not the
  running application's database. All three R2 test objects were deleted and
  their absence verified; fixture accounts/grants/sessions were disabled or
  revoked, preserving append-only test evidence.
- Eleven browser-to-R2 combinations passed: PDF/PNG/JPEG under assignment,
  attendance and live enrollment key shapes, plus PNG/JPEG under profile keys.
  Checks included signed PUT, server HEAD/size/MIME/bounded-signature validation,
  byte-for-byte signed GET and unsigned S3 endpoint denial. The eleven temporary
  objects were deleted and their absence verified. Testing an enrollment key
  shape is not acceptance of the gated enrollment UI/command workflow.
- Disposable database integration modes `class-participation`, `admissions-offers`
  and `launch-staffing` passed: six files / six tests. Their storage operations
  are mocked; these results complement, not replace, live-bucket browser checks.
- Focused R2 unit tests returned 32 passed / one failed across four files. The
  existing session-boundary fixture lacks the email now read by the locally
  modified identity resolver; it fails in `isDemoAccountEmail` before its
  successful-session assertion. No authorization fallback was introduced.
- Qualification browser uploads remain **blocked**: preflights requesting
  `content-type,if-none-match` returned HTTP 403, although `content-type` alone
  returned 204. The bucket must actually allow both headers before conditional
  browser uploads can be accepted. Qualification overwrite prevention was not
  live-tested while that preflight remained blocked.
- Enrollment live/demo and qualification upload gates remained disabled.
  Isolated demo enrollment credentials were absent. They were not aliased to the
  live bucket and no deployment gates were bypassed. End-to-end enrollment and
  qualification uploads therefore remain **unverified** in this configuration.
- The temporary wildcard-origin CORS setting is development configuration, not
  production acceptance. Restrict origins and complete the operational gates
  above before enabling school document workflows.
