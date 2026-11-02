import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, sites, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "./command-context.server";
import { readSessionGrants } from "./session-grants.server";

export async function readWorkspaceSession(request: Request) {
  let context;
  try {
    context = await getCommandContext(request);
  } catch (error) {
    if (error instanceof AuthorizationError) return { authenticated: false as const };
    throw error;
  }
  const sessionAccountId = context.sessionAccountId ?? context.accountId;
  const [account] = await db.select({ email: accessAccounts.emailNormalized })
    .from(accessAccounts).where(eq(accessAccounts.id, sessionAccountId)).limit(1);
  if (!account) throw new AuthorizationError("authenticated account");

  const { grants, demoAccountSwitching } = await readSessionGrants(sessionAccountId, account.email);
  if (!grants.some(grant => grant.id === context.grantId)) {
    throw new AuthorizationError("active membership");
  }

  const siteIds = context.scope.siteIds ?? [];
  const programIds = context.scope.programIds ?? [];
  const [siteChoices, programChoices] = await Promise.all([
    siteIds.length ? db.select({ id: sites.id, name: sites.name, organizationId: sites.organizationId })
      .from(sites).where(inArray(sites.id, siteIds)) : Promise.resolve([]),
    programIds.length ? db.select({ id: programs.id, name: programs.name, siteId: programs.siteId })
      .from(programs).where(inArray(programs.id, programIds)) : Promise.resolve([]),
  ]);
  return {
    authenticated: true as const,
    ...(demoAccountSwitching ? { demoAccountSwitching: true as const } : {}),
    sites: siteChoices, programs: programChoices, activeGrantId: context.grantId,
    role: context.role, grants: grants.map(grant => ({
      id: grant.id, personId: grant.personId, role: grant.role,
      firstName: grant.firstName, lastName: grant.lastName,
      organizationId: grant.organizationId, siteId: grant.siteId,
      ...(demoAccountSwitching ? { email: grant.email } : {}),
    })),
    activeContext: {
      organizationIds: context.scope.organizationIds ?? [],
      siteIds, programIds,
    },
  };
}

export type WorkspaceSession = Awaited<ReturnType<typeof readWorkspaceSession>>;
