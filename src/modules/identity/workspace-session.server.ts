import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, people, sites, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "./command-context.server";
import { listDemoFacilitatorGrants } from "./demo-facilitator.server";

export async function readWorkspaceSession(request: Request) {
  let context;
  try {
    context = await getCommandContext(request);
  } catch (error) {
    if (error instanceof AuthorizationError) return { authenticated: false as const };
    throw error;
  }
  const grants = context.demoFacilitator ? await listDemoFacilitatorGrants(db) : await db.select({
    id: accountPersonGrants.id, personId: accountPersonGrants.personId, role: accountPersonGrants.role,
    firstName: people.legalFirstName, lastName: people.legalLastName,
    organizationId: accountPersonGrants.organizationId, siteId: accountPersonGrants.siteId,
  }).from(accountPersonGrants).innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(eq(accountPersonGrants.accountId, context.accountId), eq(accountPersonGrants.active, true),eq(people.active,true)));
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
    sites: siteChoices, programs: programChoices, activeGrantId: context.grantId,
    role: context.role, grants: grants.map(grant => ({
      id: grant.id, personId: grant.personId, role: grant.role,
      firstName: grant.firstName, lastName: grant.lastName,
      organizationId: grant.organizationId, siteId: grant.siteId,
    })),
    ...(context.demoFacilitator ? { demoFacilitator: true as const } : {}),
    activeContext: {
      organizationIds: context.scope.organizationIds ?? [],
      siteIds, programIds,
    },
  };
}

export type WorkspaceSession = Awaited<ReturnType<typeof readWorkspaceSession>>;
