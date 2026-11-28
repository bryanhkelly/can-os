import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, sites, programs, people } from "@/db/schema";
import { parseStudentDisplayPreferences } from "@/domain/student-display-preferences";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "./command-context.server";
import { readSessionGrants, readOwnerDelegationGrants } from "./session-grants.server";

export async function readWorkspaceSession(request: Request) {
  let context;
  try {
    context = await getIdentityContext(request,{allowExpiredOwnerRecovery:true});
  } catch (error) {
    if (error instanceof AuthorizationError) return { authenticated: false as const };
    throw error;
  }
  const sessionAccountId = context.delegatedByPlatformOwner
    ? context.accountId : context.impersonatedByAccountId ?? context.sessionAccountId ?? context.accountId;
  const [account] = await db.select({ email: accessAccounts.emailNormalized })
    .from(accessAccounts).where(eq(accessAccounts.id, sessionAccountId)).limit(1);
  if (!account) throw new AuthorizationError("authenticated account");

  if(!context.actorPersonId)throw new AuthorizationError("authenticated person");
  // Owner delegation is authorized by the original independently authenticated
  // owner, not by the target account's ability to redeem a shared demo code.
  // An expired delegation projects the original owner in read-only mode.
  const { grants, demoAccountSwitching } = context.delegatedByPlatformOwner && context.role !== "platform_owner"
    ? { grants: await readOwnerDelegationGrants(sessionAccountId, context.actorPersonId, account.email), demoAccountSwitching: false }
    : await readSessionGrants(sessionAccountId, account.email,db,context.authenticationMethod);
  const visibleGrants = context.delegatedByPlatformOwner
    ? grants.filter(grant => grant.id === context.grantId) : grants;
  if (!visibleGrants.some(grant => grant.id === context.grantId)) {
    throw new AuthorizationError("active membership");
  }

  const siteIds = context.scope.siteIds ?? [];
  const programIds = context.scope.programIds ?? [];
  const [siteChoices, programChoices, studentPerson] = await Promise.all([
    siteIds.length ? db.select({ id: sites.id, name: sites.name, organizationId: sites.organizationId })
      .from(sites).where(inArray(sites.id, siteIds)) : Promise.resolve([]),
    programIds.length ? db.select({ id: programs.id, name: programs.name, siteId: programs.siteId })
      .from(programs).where(inArray(programs.id, programIds)) : Promise.resolve([]),
    context.role === "student" ? db.select({ metadata: people.metadata }).from(people)
      .where(eq(people.id, context.actorPersonId)).limit(1) : Promise.resolve([]),
  ]);
  if(context.role==="student"&&!studentPerson[0])throw new AuthorizationError("student preferences identity");
  return {
    authenticated: true as const,
    ...(demoAccountSwitching && !context.delegatedByPlatformOwner ? { demoAccountSwitching: true as const } : {}),
    ...(context.delegatedByPlatformOwner ? { ownerDelegation: {
      mode: context.delegationMode!,
      expiresAt: context.delegationExpiresAt!,
    } } : {}),
    sites: siteChoices, programs: programChoices, activeGrantId: context.grantId,
    role: context.role, grants: visibleGrants.map(grant => ({
      id: grant.id, personId: grant.personId, role: grant.role,
      firstName: grant.firstName, lastName: grant.lastName,
      organizationId: grant.organizationId, siteId: grant.siteId,
      ...(demoAccountSwitching ? { email: grant.email } : {}),
    })),
    ...(context.role==="student"?{studentPreferences:parseStudentDisplayPreferences(studentPerson[0]?.metadata.studentDisplayPreferences)}:{}),
    activeContext: {
      organizationIds: context.scope.organizationIds ?? [],
      siteIds, programIds,
    },
  };
}

export type WorkspaceSession = Awaited<ReturnType<typeof readWorkspaceSession>>;
