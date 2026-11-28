import { lockAccountProvisioningEmail, provisioningAccountSelection, readLockedProvisioningAccount } from "./account-provisioning-store.server";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { identityEmailDomain, isDemoAccountEmail } from "@/domain/domain-classification";
import { issuePrivateAccountCredential } from "./private-account-credential.server";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
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
  await lockAccountProvisioningEmail(tx, email);
  let [account] = await readLockedProvisioningAccount(tx, email);
  // A new Person at an explicitly approved synthetic Site uses the standard demo code.
  // Individual credentials remain available only for separately governed, non-demo scopes.
  const sharedScope = isDemoAccountEmail(email) && await matchesDemoCredentialScope(email,input.organizationId,input.siteId,tx);
  const individual = isDemoAccountEmail(email) && (account?.privateCredential === true || (!account && !sharedScope && input.allowIndividualCredential === true));
  if (!individual) await assertScopedCredential(tx,email,input.organizationId,input.siteId);
  if (account?.disabled || (account?.personId && account.personId!==input.personId) || (account?.privateCredential && account.personId!==input.personId))
    throw new AuthorizationError("current account Person binding");
  let privateAccessCode:string|undefined;
  if (account) {
    // Existence checks validate every historical membership without imposing
    // a maximum number of legitimate memberships on one Person.
    const [conflict]=await tx.select({id:accountPersonGrants.id})
      .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,account.id),
        sql`(${accountPersonGrants.personId} IS DISTINCT FROM ${input.personId}::uuid
          OR (${input.onlyRole??null}::text IS NOT NULL AND ${accountPersonGrants.role} IS DISTINCT FROM ${input.onlyRole??null}::text)
          OR (${isDemoAccountEmail(email)&&!individual}::boolean AND
            (${accountPersonGrants.organizationId} IS DISTINCT FROM ${input.organizationId}::uuid OR
             ${accountPersonGrants.siteId} IS DISTINCT FROM ${input.siteId}::uuid)))`)).limit(1);
    if(conflict)throw new AuthorizationError("account Person, role or credential scope conflict");
    if (!account.personId) {
      await tx.update(accessAccounts).set({personId:input.personId,updatedAt:new Date()})
        .where(eq(accessAccounts.id,account.id));
    }
  } else {
    const credential=individual?issuePrivateAccountCredential():undefined;
    privateAccessCode=credential?.privateAccessCode;
    [account] = await tx.insert(accessAccounts).values({emailNormalized:email,personId:input.personId,
      ...(credential?{privateAccessCodeHash:credential.privateAccessCodeHash}:{})})
      .returning(provisioningAccountSelection);
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
