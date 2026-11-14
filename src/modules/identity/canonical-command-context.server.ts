import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import {
  canonicalAuthReaderDatabaseRole,
  canonicalSessionCookie,
  canonicalSessionRowSchema,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";

/**
 * A completely native v3.0.1 session. No account, Person, Site, grant or
 * Organization is read from public-schema identity records.
 */
export async function getCanonicalCommandContext(request: Request): Promise<CommandContext> {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.split(";").map(item => item.trim())
    .find(item => item.startsWith(canonicalSessionCookie + "="))
    ?.slice(canonicalSessionCookie.length + 1);
  if (!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw)) {
    throw new AuthorizationError("authenticated session");
  }
  const pepper = process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new AuthorizationError("canonical session configuration");
  }
  const digest = createHash("sha256")
    .update(pepper).update(":").update(raw).digest("hex");

  const records = await db.transaction(async tx => {
    // Purpose-specific role may only EXECUTE the SECURE, read-only session
    // projection. It receives no SELECT on raw secret hashes or grants.
    await tx.execute(sql.raw(`SET LOCAL ROLE ${canonicalAuthReaderDatabaseRole}`));
    const result = await tx.execute(sql`
      SELECT account_id, session_id, grant_id, person_id,
        role_code, organization_id, site_id
      FROM education_v30.v301_canonical_session_context(${digest}::text)
    `);
    return result.rows;
  });

  if (records.length !== 1) throw new AuthorizationError("authenticated session");
  return projectCanonicalCommandContext(canonicalSessionRowSchema.parse(records[0]));
}
