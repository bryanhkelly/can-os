import { db } from "@/db/client";
import { privateAccountGrantEligible } from "@/domain/private-account-authority";
import { hasValidAccessGrantScope } from "@/domain/access-grant-scope";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";
import { listActiveAccountGrants, type GrantReader } from "./account-grant-reader.server";
import { readLegacyCredentialGrants } from "./legacy-shared-credential-grants.server";

// Retain the existing fixture bootstrap import contract until fixture retirement.
export { listDemoSourceGrants } from "./legacy-shared-credential-grants.server";

/** Resolve only current account grants or the separately provisioned demo-admin switch list. */
export async function readSessionGrants(accountId: string, email: string, reader: GrantReader = db) {
  const normalizedEmail = email.trim().toLowerCase();
  const ownGrants = (await listActiveAccountGrants(accountId, reader))
    .filter(grant => grant.accountId === accountId && hasValidAccessGrantScope(grant));

  // Private credentials replace the shared-code scope, not ordinary grants.
  // Enrollment/rotation revokes earlier sessions; public fixture switching
  // cannot target accounts with individual credentials.
  if (ownGrants.some(grant => grant.privateCredential)) {
    if (!isDemoAccountEmail(normalizedEmail)) return {grants:[],demoAccountSwitching:false};
    const grants = ownGrants.filter(grant => grant.privateCredential && privateAccountGrantEligible(grant,accountId,normalizedEmail));
    if (grants.length) await assertRawAccountPerson(accountId,grants[0]!.personId,reader);
    const founder = grants.find(grant => grant.role==="site_admin" && grant.siteId);
    return {grants,demoAccountSwitching:false,...(founder?.siteId?{launchSiteId:founder.siteId}:{})};
  }

  return readLegacyCredentialGrants(accountId,normalizedEmail,ownGrants,reader);
}

/** Independently authenticated Platform Owner may project an existing eligible
 * membership. This is not a target-account login: do not consult public fixture
 * credential registration or a target account's cross-account switch list.
 * Callers must independently authenticate the owner and apply view/act policy. */
export async function readOwnerDelegationGrants(accountId: string, personId: string, email: string, reader: GrantReader = db) {
  try { await assertRawAccountPerson(accountId, personId, reader); }
  catch (error) { if (error instanceof AuthorizationError) return []; throw error; }
  const grants = await listActiveAccountGrants(accountId, reader);
  return grants.filter(grant => grant.accountId === accountId && grant.personId === personId &&
    grant.accountPersonId === personId && grant.email === email.trim().toLowerCase() &&
    (grant.emailVerifiedAt !== null && grant.emailVerifiedAt !== undefined || isDemoAccountEmail(grant.email)) &&
    grant.active && grant.role !== "platform_owner" && hasValidAccessGrantScope(grant));
}
