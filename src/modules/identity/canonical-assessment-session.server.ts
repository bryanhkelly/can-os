import { sql } from "drizzle-orm";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { canonicalSessionDigestFromRequest } from "./canonical-command-context.server";

/**
 * Bind the optional canonical assessment author/reviewer/publisher commands
 * to the same active session digest used by CAN and native CAN OS access.
 *
 * This GUC is transaction-local, not a client-supplied Person assertion.
 * Database SECURITY DEFINER functions independently verify the digest by
 * calling the existing, time/revocation-aware session projection functions
 * AND comparing the resolved Person, Organization and staff role.
 */
export async function bindCanonicalAssessmentSession(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  request: Request,
): Promise<void> {
  const rawCanSession = (request.headers.get("cookie") ?? "")
    .split(";").map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(accessSessionCookie + "="))
    ?.slice(accessSessionCookie.length + 1);

  let digest: string;
  if (rawCanSession !== undefined) {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(rawCanSession) ||
        (process.env.CAN_ACCESS_TOKEN_PEPPER?.length ?? 0) < 32)
      throw new AuthorizationError("current CAN publisher staff session");
    digest = hashAccessSecret(rawCanSession, process.env.CAN_ACCESS_TOKEN_PEPPER!);
  } else {
    digest = canonicalSessionDigestFromRequest(request);
  }
  if (!/^[a-f0-9]{64}$/i.test(digest))
    throw new AuthorizationError("verified assessment session digest");
  await tx.execute(sql`SELECT set_config('can.assessment.session_hash', ${digest}, true)`);
}
