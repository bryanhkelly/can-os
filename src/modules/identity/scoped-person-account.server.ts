import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { identityEmailDomain } from "@/domain/domain-classification";
import { normalizeAccessEmail, issueOpaqueSecret, hashPrivateAccessCode } from "@/domain/access-tokens";
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
  /** Set only after the owning workflow independently confirms identity. */
  allowIndividualCredential?: boolean;
}) {
  const email = normalizeAccessEmail(input.email);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"person-account:" + email}))`);
  let [account] = await tx.select({id:accessAccounts.id,personId:accessAccounts.personId,
    disabled:accessAccounts.disabled,privateCredential:sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`}).from(accessAccounts)
    .where(eq(accessAccounts.emailNormalized,email)).for("update").limit(1);
  const individual = isDemoAccountEmail(email) && (account?.privateCredential === true || (!account && input.allowIndividualCredential === true));
  if (!individual) await assertScopedCredential(tx,email,input.organizationId,input.siteId);
  if (account?.disabled || (account?.personId && account.personId!==input.personId) || (account?.privateCredential && account.personId!==input.personId))
    throw new AuthorizationError("current account Person binding");
  let privateAccessCode:string|undefined;
  if (account) {
    const grants = await tx.select({personId:accountPersonGrants.personId,role:accountPersonGrants.role,
      organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId})
      .from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id));
    if (grants.some(g=>g.personId!==input.personId))
      throw new AuthorizationError("account email belongs to a different identity");
    if (input.onlyRole && grants.some(g=>g.role!==input.onlyRole))
      throw new AuthorizationError("separate student-only account required");
    if (isDemoAccountEmail(email) && !individual && grants.some(g=>g.organizationId!==input.organizationId || g.siteId!==input.siteId))
      throw new AuthorizationError("existing identity and membership scope");
    if (!account.personId) {
      await tx.update(accessAccounts).set({personId:input.personId,updatedAt:new Date()})
        .where(eq(accessAccounts.id,account.id));
    }
  } else {
    if(individual)privateAccessCode=issueOpaqueSecret();
    [account] = await tx.insert(accessAccounts).values({emailNormalized:email,personId:input.personId,
      ...(privateAccessCode?{privateAccessCodeHash:hashPrivateAccessCode(privateAccessCode,process.env.CAN_ACCESS_TOKEN_PEPPER??"")}:{})})
      .returning({id:accessAccounts.id,personId:accessAccounts.personId,disabled:accessAccounts.disabled,
        privateCredential:sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`});
  }
  if (!account) throw new Error("Account could not be provisioned");
  const domain = identityEmailDomain(email);
  if (domain) await tx.update(people).set({domain, updatedAt:new Date()})
    .where(and(eq(people.id,input.personId),isNull(people.domain)));
  return {id:account.id,email,privateCredential:individual,...(privateAccessCode?{privateAccessCode}:{})};
}

/** A shared-code guardian can authorize a synthetic child account at the
 * same Site, never an actual mailbox or a different institution. */
export async function assertFamilyCredentialPair(
  tx: Pick<Tx,"select">, adult: {email:string;verified:Date|null;privateCredential?:boolean}|undefined,
  childEmail:string, organizationId:string, siteId:string,
) {
  if (!adult || adult.email===childEmail || childEmail.endsWith(".invalid")) throw new AuthorizationError("separate adult and student identities");
  // Caller must resolve the direct current session and verified guardian relationship.
  if (adult.privateCredential && isDemoAccountEmail(adult.email)) return;
  if (isDemoAccountEmail(adult.email)) {
    await assertScopedCredential(tx,childEmail,organizationId,siteId);
    if (!isDemoAccountEmail(childEmail) ||
        !await matchesDemoCredentialScope(adult.email,organizationId,siteId,tx))
      throw new AuthorizationError("approved same-Site family credentials");
  } else if (!adult.verified) {
    throw new AuthorizationError("verified adult account");
  }
}
