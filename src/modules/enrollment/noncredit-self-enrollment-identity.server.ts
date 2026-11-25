import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { canonicalSessions } from "@/db/canonical-v301";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { secureSessionCookieHeader } from "@/domain/session-cookies";
import { hashAccessSecret, issueOpaqueSecret } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertRawAccountPerson, assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";

import { hasApprovedDemoPersonalCredential, readDemoCredentialDomain } from "@/modules/identity/demo-school-tenants.server";

type VerifiedSelfEnrollmentActor = {
  accountId: string; personId: string; email: string;
  preferredName: string | null; emailVerifiedAt: Date;
};

export async function requireVerifiedAdultAccount(): Promise<VerifiedSelfEnrollmentActor> {
  const actor = await getCommandContext(getRequest());
  // Synthetic demo switching is not acceptable evidence of a unique adult.
  if (actor.sessionAccountId || !actor.actorPersonId)
    throw new AuthorizationError("verified individual CAN identity");
  const [account] = await db.select({
    email:accessAccounts.emailNormalized,
    verified:accessAccounts.emailVerifiedAt,
    disabled:accessAccounts.disabled,
  }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
  if (!account || account.disabled || !account.verified || isDemoAccountEmail(account.email))
    throw new AuthorizationError("verified independent CAN account");
  await assertUnambiguousAdultAccount(actor.accountId, actor.actorPersonId);
  const [person] = await db.select({
    id:people.id,active:people.active,
    preferredName:people.preferredName,firstName:people.legalFirstName,
  }).from(people).where(eq(people.id,actor.actorPersonId)).limit(1);
  if(!person?.active)throw new AuthorizationError("active account Person");
  return {accountId:actor.accountId,personId:actor.actorPersonId,
    email:account.email,preferredName:person.preferredName??person.firstName,
    emailVerifiedAt:account.verified};
}


type ParticipantReader = Pick<typeof db,"select">;
export type NoncreditParticipantAccount = {
  accountId:string; personId:string; email:string;
  demoScope:{organizationId:string;siteId:string}|null;
};

/** Ordinary noncredit opportunity access supports approved account-only demo
 * credentials. This is not independently verified adulthood or permission to
 * enter the protected native learner/session bridge. */
export async function readNoncreditParticipantAccount(
  accountId:string,personId:string,reader:ParticipantReader=db,
):Promise<NoncreditParticipantAccount> {
  const [account]=await reader.select({email:accessAccounts.emailNormalized,
    verified:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,
    personId:accessAccounts.personId}).from(accessAccounts)
    .where(eq(accessAccounts.id,accountId)).limit(1);
  if(!account||account.disabled||account.personId!==personId)
    throw new AuthorizationError("current participant identity");
  const [person]=await reader.select({active:people.active}).from(people)
    .where(eq(people.id,personId)).limit(1);
  if(!person?.active)throw new AuthorizationError("active participant Person");
  if(!isDemoAccountEmail(account.email)) {
    await assertUnambiguousAdultAccount(accountId,personId,reader);
    return {accountId,personId,email:account.email,demoScope:null};
  }
  if(!await hasApprovedDemoPersonalCredential(accountId,account.email,reader))
    throw new AuthorizationError("approved personal demo credential");
  await assertRawAccountPerson(accountId,personId,reader);
  const grants=await reader.select({role:accountPersonGrants.role,personId:accountPersonGrants.personId,
    organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId})
    .from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,accountId),
      eq(accountPersonGrants.active,true))).limit(101);
  if(grants.length!==1||grants[0]?.role!=="account_holder"||
     grants[0].organizationId!==null||grants[0].siteId!==null||grants[0].personId!==personId)
    throw new AuthorizationError("direct account-only demo participant");
  const demoScope=await readDemoCredentialDomain(account.email,reader);
  if(!demoScope)throw new AuthorizationError("current demo credential scope");
  return {accountId,personId,email:account.email,demoScope};
}

export async function requireNoncreditParticipantAccount():Promise<NoncreditParticipantAccount> {
  const actor=await getCommandContext(getRequest());
  if(!actor.actorPersonId||actor.sessionAccountId||actor.impersonatedByAccountId||
     actor.delegatedByPlatformOwner||actor.delegationMode)
    throw new AuthorizationError("direct participant account");
  return readNoncreditParticipantAccount(actor.accountId,actor.actorPersonId);
}

/** Shared credentials may never consume a live program seat or be included
 * in another institution's participant ledger. */
export function assertNoncreditParticipantRelease(owner:NoncreditParticipantAccount,
  release:{registeringOrganizationId:string;siteId:string|null}) {
  if(owner.demoScope&&(owner.demoScope.organizationId!==release.registeringOrganizationId||
      owner.demoScope.siteId!==release.siteId))
    throw new AuthorizationError("participant credential eligible for this release");
}


const NATIVE_SESSION_SECONDS = 12 * 60 * 60;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Only the server may issue a privileged native learning session cookie. */
export async function issueNativeLearnerSession(tx:Tx, accountId:string, grantId:string, now:Date) {
  const pepper=process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
  if(!pepper||pepper.length<32)
    throw new Error("Native learning session is temporarily unavailable");
  const token=issueOpaqueSecret();
  const [session]=await tx.insert(canonicalSessions).values({
    accountId,activeGrantId:grantId,
    secretHash:hashAccessSecret(token,pepper),
    expiresAt:new Date(now.getTime()+NATIVE_SESSION_SECONDS*1000),
    lastActivityAt:now,
  }).returning({id:canonicalSessions.id});
  if(!session)throw new Error("Could not start verified learning session");
  return secureSessionCookieHeader(canonicalSessionCookie, token, NATIVE_SESSION_SECONDS);
}
