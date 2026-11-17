import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";

/**
 * Verify adult identity against RAW active memberships, never the filtered
 * session grant projection. Bound the read and fail closed on overflow.
 * Callers must independently verify the account and Person are active and
 * the account email is verified.
 */
export async function assertUnambiguousAdultAccount(
  accountId: string,
  personId: string,
): Promise<void> {
  const grants = await db.select({
    personId: accountPersonGrants.personId,
    role: accountPersonGrants.role,
  }).from(accountPersonGrants).where(and(
    eq(accountPersonGrants.accountId, accountId),
    eq(accountPersonGrants.active, true),
  )).limit(101);
  if (!grants.length || grants.length > 100 ||
      grants.some(grant => grant.personId !== personId || grant.role === "student")) {
    throw new AuthorizationError("unambiguous adult account");
  }
}
