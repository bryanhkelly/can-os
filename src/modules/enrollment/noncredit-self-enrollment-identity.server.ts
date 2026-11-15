import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, people } from "@/db/schema";
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

