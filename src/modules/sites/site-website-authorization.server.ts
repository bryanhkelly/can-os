import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, memberships, organizations, people, roleAssignments, sites, siteAffiliations } from "@/db/schema";
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
  if (!siteId || !actor.actorPersonId || !["site_website_editor", "site_admin"].includes(actor.role)) {
    throw new AuthorizationError("site-specific website editor membership");
  }

  const [site] = await executor.select({
    id: sites.id, organizationId: sites.organizationId,
    name: sites.name, slug: sites.slug, organizationName: organizations.name,
    organizationType: organizations.type, parentOrganizationId: organizations.parentOrganizationId,
  }).from(sites)
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("partner website Site does not exist");
  assertPartnerWebsitePreviewScope(actor, site);
  if (!actor.capabilities.has(capability)) throw new AuthorizationError("partner website publishing permission");

  if (actor.role === "site_admin") {
    // Site Admin authority comes from the exact active account grant and local
    // membership, not an editor appointment or a client-selected Site.
    const [administrator] = await executor.select({ id: accountPersonGrants.id })
      .from(accountPersonGrants)
      .innerJoin(memberships, and(eq(memberships.personId, accountPersonGrants.personId),
        eq(memberships.organizationId, accountPersonGrants.organizationId)))
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .where(and(eq(accountPersonGrants.id, actor.grantId),
        eq(accountPersonGrants.accountId, actor.accountId),
        eq(accountPersonGrants.personId, actor.actorPersonId),
        eq(accountPersonGrants.organizationId, site.organizationId),
        eq(accountPersonGrants.siteId, site.id), eq(accountPersonGrants.role, "site_admin"),
        eq(accountPersonGrants.active, true), eq(people.active, true))).limit(1);
    if (!administrator) throw new AuthorizationError("active Site Administrator relationship");
    const [affiliation] = await executor.select({ id: siteAffiliations.id }).from(siteAffiliations)
      .where(and(eq(siteAffiliations.siteId, site.id), eq(siteAffiliations.status, "approved"))).limit(1);
    if (affiliation || ["denomination", "can_network"].includes(site.organizationType))
      throw new AuthorizationError("Network-governed schools retain their existing website approval workflow");
    const visited=new Set([site.organizationId]);
    let parentId=site.parentOrganizationId;
    while(parentId) {
      if(visited.has(parentId))throw new AuthorizationError("school ownership relationship requires review");
      visited.add(parentId);
      const [parent]=await executor.select({type:organizations.type,parentOrganizationId:organizations.parentOrganizationId})
        .from(organizations).where(eq(organizations.id,parentId)).limit(1);
      if(!parent || ["denomination","can_network"].includes(parent.type))
        throw new AuthorizationError("Network ownership requires the existing website approval workflow");
      parentId=parent.parentOrganizationId;
    }
    return { ...site, canPublish: actor.capabilities.has(siteWebsiteLocalPublishCapability) };
  }

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

