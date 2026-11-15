import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, people } from "@/db/schema";
import { canonicalSessions } from "@/db/canonical-v301";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { hashAccessSecret, issueOpaqueSecret } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSessionGrants } from "@/modules/identity/session-grants.server";

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
  const { grants, demoAccountSwitching } =
    await readSessionGrants(actor.accountId,account.email);
  if(demoAccountSwitching || new Set(grants.map(g=>g.personId)).size!==1 ||
     !grants.some(g=>g.id===actor.grantId&&g.personId===actor.actorPersonId) ||
     grants.some(g=>g.role==="student"))
    throw new AuthorizationError("unambiguous adult account");
  const [person] = await db.select({
    id:people.id,active:people.active,
    preferredName:people.preferredName,firstName:people.legalFirstName,
  }).from(people).where(eq(people.id,actor.actorPersonId)).limit(1);
  if(!person?.active)throw new AuthorizationError("active account Person");
  return {accountId:actor.accountId,personId:actor.actorPersonId,
    email:account.email,preferredName:person.preferredName??person.firstName,
    emailVerifiedAt:account.verified};
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
  return `${canonicalSessionCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${NATIVE_SESSION_SECONDS}`;
}
