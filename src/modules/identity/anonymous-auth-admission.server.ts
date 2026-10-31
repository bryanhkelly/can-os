import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * An intentionally GLOBAL, application-level admission ceiling for anonymous
 * auth endpoints. The reverse proxy's client identity has not been verified,
 * so no IP, Origin, forwarded header or submitted email is used as a bucket.
 *
 * Exactly one row per endpoint is maintained. Church applications have their own budget. The Postgres upsert atomically
 * admits or rejects concurrent requests and resets at each 60-second boundary.
 * A malicious caller can exhaust a shared budget: trusted-edge per-source
 * protection and service-specific operational limits remain mandatory.
 */
export type AuthAdmissionRoute = "request" | "verify" | "church_application";
export const AUTH_ADMISSION_POLICY: Record<AuthAdmissionRoute, number> = {
  request: 240,
  verify: 600,
  church_application: 40,
};
export const AUTH_ADMISSION_WINDOW_SECONDS = 60;

export class AuthAdmissionUnavailableError extends Error {
  constructor() {
    super("Authentication admission unavailable");
    this.name = "AuthAdmissionUnavailableError";
  }
}

export type AuthAdmissionResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function decideAuthAdmissionRow(
  row: { allowed?: unknown; retryAfterSeconds?: unknown } | undefined,
): AuthAdmissionResult {
  if (!row || typeof row.allowed !== "boolean") throw new AuthAdmissionUnavailableError();
  const retryAfterSeconds = row.allowed ? 0 :
    typeof row.retryAfterSeconds === "number" && Number.isFinite(row.retryAfterSeconds) ?
      Math.max(1, Math.min(60, Math.ceil(row.retryAfterSeconds))) :
      AUTH_ADMISSION_WINDOW_SECONDS;
  return { allowed: row.allowed, retryAfterSeconds };
}

/** Fail closed when the shared database gate cannot be reached. */
export async function admitAnonymousAuthRequest(route: AuthAdmissionRoute): Promise<AuthAdmissionResult> {
  const maximum = AUTH_ADMISSION_POLICY[route];
  if (!maximum) throw new AuthAdmissionUnavailableError();
  let result: { rows?: Array<{ allowed?: unknown; retryAfterSeconds?: unknown }> };
  try {
    result = await db.execute(sql`
      INSERT INTO auth_request_rate_limits AS bucket
        (route, window_started_at, request_count)
      VALUES (${route}, now(), 1)
      ON CONFLICT (route) DO UPDATE SET
        request_count = CASE
          WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN 1
          ELSE LEAST(bucket.request_count + 1, ${maximum + 1})
        END,
        window_started_at = CASE
          WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN now()
          ELSE bucket.window_started_at
        END
      RETURNING
        request_count <= ${maximum} AS allowed,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM
          (window_started_at + interval '60 seconds' - now())))::integer)
          AS "retryAfterSeconds"
    `);
  } catch {
    throw new AuthAdmissionUnavailableError();
  }
  return decideAuthAdmissionRow(result.rows?.[0]);
}

/** Explicit denial, independent of supplied credential or account existence. */
export function anonymousAuthAdmissionResponse(result: AuthAdmissionResult): Response | null {
  if (result.allowed) return null;
  return Response.json({ error: "Too many authentication requests. Try again later." }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(result.retryAfterSeconds),
    },
  });
}

export function anonymousAuthUnavailableResponse(): Response {
  return Response.json({ error: "Authentication temporarily unavailable." }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "30" },
  });
}
