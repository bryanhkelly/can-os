import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accessSessions, accountPersonGrants, people } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { sessionIdleCutoff } from "@/domain/access-tokens";
import { individualStaffIssuerEligible } from "@/domain/individual-staff-handoff";

/** Credential authority only. The caller must independently authorize the
 * resource, exact scope, role and identity-review workflow. */
export async function canIssueIndividualCredential(
  tx: Pick<typeof db,"select">, actor:AccessContext,
):Promise<boolean>{
  if(!actor.actorPersonId || !actor.grantId || !actor.sessionId ||
    actor.sessionAccountId || actor.impersonatedByAccountId ||
    actor.delegatedByPlatformOwner || actor.delegationMode) return false;
  const now=new Date();
  const [issuer]=await tx.select({
    personId:accessAccounts.personId,disabled:accessAccounts.disabled,
    email:accessAccounts.emailNormalized,emailVerifiedAt:accessAccounts.emailVerifiedAt,
    privateCredential:sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`,
    authenticationMethod:accessSessions.authenticationMethod,
  }).from(accessAccounts)
    .innerJoin(accessSessions,eq(accessSessions.accountId,accessAccounts.id))
    .innerJoin(accountPersonGrants,and(eq(accountPersonGrants.id,accessSessions.activeGrantId),
      eq(accountPersonGrants.accountId,accessAccounts.id),eq(accountPersonGrants.personId,actor.actorPersonId),
      eq(accountPersonGrants.role,actor.role),eq(accountPersonGrants.active,true)))
    .innerJoin(people,and(eq(people.id,accessAccounts.personId),eq(people.active,true)))
    .where(and(eq(accessAccounts.id,actor.accountId),eq(accessSessions.id,actor.sessionId),
      eq(accessSessions.activeGrantId,actor.grantId),isNull(accessSessions.revokedAt),
      sql`${accountPersonGrants.siteId} IS NOT DISTINCT FROM ${actor.grantSiteId}::uuid`,
      gt(accessSessions.expiresAt,now),gt(accessSessions.updatedAt,sessionIdleCutoff(now)),
      isNull(accessSessions.delegatedGrantId),
      sql`(NOT ${accessSessions.sharedDevice} OR ${accessSessions.lastActivityAt} > ${new Date(now.getTime()-300000)})`))
    .for("share").limit(1);
  return individualStaffIssuerEligible(issuer,actor.actorPersonId);
}
