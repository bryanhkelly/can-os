# Private Cloudflare R2 enrollment documents

CAN OS uses a private Cloudflare R2 bucket (S3-compatible API), not Neon object storage, for enrollment document bytes. The canonical `documents` database table holds metadata and an opaque R2 key.

## Configuration (server-only Netlify environment)

- `CAN_R2_ACCOUNT_ID`: 32-character Cloudflare account ID
- `CAN_R2_BUCKET`: private bucket name
- `CAN_R2_ACCESS_KEY_ID`: R2 API token access key
- `CAN_R2_SECRET_ACCESS_KEY`: R2 API token secret
- `CAN_R2_DEMO_UPLOADS_ENABLED=true`: explicit opt-in, **off by default**
- Existing `CAN_DEMO_WRITES_ENABLED` gate still applies

Never use `VITE_` variables for credentials; never expose a public R2 bucket for student documents. Use an R2 token scoped to this bucket only. Restrict bucket CORS to the authorized demo origin, `PUT` method and `Content-Type` header. CORS is not authentication.

## Initial two-stage synthetic upload API

`beginSyntheticR2DocumentUpload` validates the application and requirement, filename, MIME type and size (up to 10 MB), then returns an object-specific **three-minute PUT URL**. A browser PUT must send the exact signed Content-Type and file bytes. `finishSyntheticR2DocumentUpload` checks the same application requirement, performs an R2 HEAD to verify uploaded size and MIME type, and inserts metadata/audit events.

This is **not a complete secure family upload service**. The current synthetic role label is not real auth; therefore `CAN_R2_DEMO_UPLOADS_ENABLED` must stay false in the public deployment until session-backed principal and household/registrar authorization are wired into both endpoints. Presigned PUT URLs are bearer credentials and can be reused until expiry. Restrict this feature to synthetic test files, never real student documents. Production hardening must add server-side content verification, abuse/rate limits, virus scanning, file-lifecycle cleanup and retrieval permissions. No public download URLs are created.
