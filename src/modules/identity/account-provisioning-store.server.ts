import { eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All account provisioning paths serialize on the same normalized mailbox.
 * Call inside the owning transaction, before reading or inserting an Account. */
export async function lockAccountProvisioningEmail(tx: Tx, normalizedEmail: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"person-account:" + normalizedEmail}))`);
}

/** Never return a stored credential hash to a provisioning workflow. */
export const provisioningAccountSelection = {
  id: accessAccounts.id,
  personId: accessAccounts.personId,
  disabled: accessAccounts.disabled,
  privateCredential: sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`,
};

/** Read and lock the current Account row within the same transaction. */
export async function readLockedProvisioningAccount(tx: Tx, normalizedEmail: string) {
  return tx.select(provisioningAccountSelection)
    .from(accessAccounts)
    .where(eq(accessAccounts.emailNormalized, normalizedEmail))
    .for("update")
    .limit(1);
}
