import { and, eq, not } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";

type GrantReader = Pick<typeof db, "select">;

/** One authoritative raw-grant invariant for every real CAN login.
 * The filtered session grants cannot prove the account-Person relationship.
 */
export async function assertRawAccountPerson(
  accountId: string, personId: string, reader: GrantReader = db,
): Promise<void> {
  if (!accountId || !personId)
    throw new AuthorizationError("one account Person");
  const conflicting = await reader.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants).where(and(
      eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, true),
      not(eq(accountPersonGrants.personId, personId)),
    )).limit(1);
  if (conflicting.length)
    throw new AuthorizationError("one account Person");
}

/** Adult enrollment is stricter than ordinary sign-in: reject active student
 * roles and fail closed on grant overflow. Reusable inside transactions.
 * Callers also verify the account anchor, verified email and active Person.
 */
export async function assertUnambiguousAdultAccount(
  accountId: string, personId: string, reader: GrantReader = db,
): Promise<void> {
  await assertRawAccountPerson(accountId, personId, reader);
  const grants = await reader.select({
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
