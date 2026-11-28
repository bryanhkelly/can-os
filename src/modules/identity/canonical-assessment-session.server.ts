import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { readCookie } from "@/domain/session-cookies";

/** Bind assessment commands to the original shared CAN bearer, never a
 * native-only credential or a caller-selected Person. The SQL authority
 * function independently locks and validates the exact live staff grant. */
export async function bindCanonicalAssessmentSession(
  tx: Pick<typeof db, "execute">,
  request: Request,
): Promise<void> {
  const raw=readCookie(request,accessSessionCookie);
  const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
  if(!raw||!(/^[A-Za-z0-9_-]{40,128}$/).test(raw)||!pepper||pepper.length<32)
    throw new AuthorizationError("current CAN publisher staff session");
  const digest=hashAccessSecret(raw,pepper);
  await tx.execute(sql`SELECT set_config('can.assessment.session_hash', ${digest}, true)`);
}
