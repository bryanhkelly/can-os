import { eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants } from "@/db/schema";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { matchesDemoCredentialScope } from "./demo-school-tenants.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Credential eligibility only. The calling workflow owns all role and
 * relationship approval. Shared credentials cannot be attached to live Sites. */
export async function assertScopedCredential(
  tx: Pick<Tx,"select">, email: string, organizationId: string, siteId: string | null,
): Promise<void> {
  if (email.endsWith(".invalid") ||
      (email.endsWith(".demo") && !await matchesDemoCredentialScope(email, organizationId, siteId, tx)))
    throw new AuthorizationError("eligible credential for the requested Site");
}

/** One Person binding for authorized family account provisioning. Does not
 * create, activate or restore a membership and does not verify a mailbox. */
export async function provisionScopedPersonAccount(tx: Tx, input: {
  email: string; personId: string; organizationId: string; siteId: string | null;
  onlyRole?: string;
}) {
  const email = normalizeAccessEmail(input.email);
  await assertScopedCredential(tx,email,input.organizationId,input.siteId);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"person-account:" + email}))`);
  let [account] = await tx.select({id:accessAccounts.id,personId:accessAccounts.personId,
    disabled:accessAccounts.disabled}).from(accessAccounts)
    .where(eq(accessAccounts.emailNormalized,email)).for("update").limit(1);
  if (account?.disabled || (account?.personId && account.personId!==input.personId))
    throw new AuthorizationError("current account Person binding");
  if (account) {
    const grants = await tx.select({personId:accountPersonGrants.personId,role:accountPersonGrants.role,
      organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId})
      .from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id));
    if (grants.some(g=>g.personId!==input.personId))
      throw new AuthorizationError("account email belongs to a different identity");
    if (input.onlyRole && grants.some(g=>g.role!==input.onlyRole))
      throw new AuthorizationError("separate student-only account required");
    if (isDemoAccountEmail(email) && grants.some(g=>g.organizationId!==input.organizationId || g.siteId!==input.siteId))
      throw new AuthorizationError("existing identity and membership scope");
    if (!account.personId) {
      await tx.update(accessAccounts).set({personId:input.personId,updatedAt:new Date()})
        .where(eq(accessAccounts.id,account.id));
    }
  } else {
    [account] = await tx.insert(accessAccounts).values({emailNormalized:email,personId:input.personId})
      .returning({id:accessAccounts.id,personId:accessAccounts.personId,disabled:accessAccounts.disabled});
  }
  if (!account) throw new Error("Account could not be provisioned");
  return {id:account.id,email};
}

/** A shared-code guardian can authorize a synthetic child account at the
 * same Site, never an actual mailbox or a different institution. */
export async function assertFamilyCredentialPair(
  tx: Pick<Tx,"select">, adult: {email:string;verified:Date|null}|undefined,
  childEmail:string, organizationId:string, siteId:string,
) {
  await assertScopedCredential(tx,childEmail,organizationId,siteId);
  if (!adult || adult.email===childEmail) throw new AuthorizationError("separate adult and student identities");
  if (isDemoAccountEmail(adult.email)) {
    if (!isDemoAccountEmail(childEmail) ||
        !await matchesDemoCredentialScope(adult.email,organizationId,siteId,tx))
      throw new AuthorizationError("approved same-Site family credentials");
  } else if (!adult.verified) {
    throw new AuthorizationError("verified adult account");
  }
}
