import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, people, roleAssignments, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertPartnerWebsitePreviewScope, siteWebsiteDraftReadCapability, siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";

/**
 * Verified Site-specific membership + person + Site role relationship.
 * Invoked in the write transaction to avoid trusting a client scope or role.
 */
type Reader = Pick<typeof db, "select">;

export async function requirePartnerWebsiteEditor(
  actor: AccessContext, executor: Reader = db,
  capability: typeof siteWebsiteDraftReadCapability | typeof siteWebsiteLocalPublishCapability = siteWebsiteDraftReadCapability,
) {
  const siteId = actor.grantSiteId;
  if (!siteId || !actor.actorPersonId || actor.role !== "site_website_editor") {
    throw new AuthorizationError("site-specific website editor membership");
  }

  const [site] = await executor.select({
    id: sites.id, organizationId: sites.organizationId,
    name: sites.name, organizationName: organizations.name,
  }).from(sites)
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("partner website Site does not exist");
  assertPartnerWebsitePreviewScope(actor, site);
  if (!actor.capabilities.has(capability)) throw new AuthorizationError("partner website publishing permission");

  const [assignment] = await executor.select({ id: roleAssignments.id, capabilities: roleAssignments.capabilities })
    .from(roleAssignments)
    .innerJoin(memberships, and(
      eq(memberships.personId, roleAssignments.personId),
      eq(memberships.organizationId, roleAssignments.organizationId),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(
      eq(roleAssignments.personId, actor.actorPersonId),
      eq(people.active, true),
      eq(roleAssignments.roleKey, "site_website_editor"),
      eq(roleAssignments.organizationId, site.organizationId),
      eq(roleAssignments.siteId, site.id),
      isNull(roleAssignments.programId),
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([capability])}::jsonb`,
    )).limit(1);
  if (!assignment) throw new AuthorizationError("explicit Site website editor assignment");
  return { ...site, canPublish: assignment.capabilities.includes(siteWebsiteLocalPublishCapability) };

}

