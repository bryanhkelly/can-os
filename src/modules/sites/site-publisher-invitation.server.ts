import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db/client";
import { memberships, roleAssignments } from "@/db/schema";
import {
  siteWebsiteDraftReadCapability, siteWebsiteLocalPublishCapability,
} from "@/domain/site-publication-policy";

export const siteWebsitePublisherCapabilities = [
  siteWebsiteDraftReadCapability,
  siteWebsiteLocalPublishCapability,
] as const;

type Mutation = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Add only the relationship rows required by the canonical staff invitation.
 * The inactive account/person grant remains the activation gate; these rows do
 * not make an invitation accessible before email-link acceptance.
 */
export async function provisionSiteWebsitePublisherRelationship(
  tx: Mutation,
  input: { personId: string; organizationId: string; siteId: string },
) {
  const [existingMembership] = await tx.select({ id: memberships.id })
    .from(memberships).where(and(
      eq(memberships.personId, input.personId),
      eq(memberships.organizationId, input.organizationId),
    )).limit(1);
  let membershipCreated = false;
  if (!existingMembership) {
    const [membership] = await tx.insert(memberships).values({
      personId: input.personId,
      organizationId: input.organizationId,
      title: "Church website publisher",
      metadata: { purpose: "site_website_publishing" },
    }).returning({ id: memberships.id });
    if (!membership) throw new Error("Website publisher membership could not be created");
    membershipCreated = true;
  }

  const [existingAssignment] = await tx.select({
    id: roleAssignments.id, capabilities: roleAssignments.capabilities,
    metadata: roleAssignments.metadata,
  }).from(roleAssignments).where(and(
    eq(roleAssignments.personId, input.personId),
    eq(roleAssignments.organizationId, input.organizationId),
    eq(roleAssignments.siteId, input.siteId),
    isNull(roleAssignments.programId),
    eq(roleAssignments.roleKey, "site_website_editor"),
  )).limit(1);
  if (existingAssignment) {
    // A soft-revoked assignment is retained compliance evidence, not a live
    // grant: re-invitation restores the same row instead of no-oping on it.
    if (existingAssignment.metadata?.revokedAt) {
      const [restored] = await tx.update(roleAssignments).set({
        capabilities: [...siteWebsitePublisherCapabilities],
        metadata: { ...existingAssignment.metadata, revokedAt: null,
          revocationReason: null, revokedByPersonId: null },
        updatedAt: new Date(),
      }).where(eq(roleAssignments.id, existingAssignment.id))
        .returning({ id: roleAssignments.id });
      if (!restored) throw new Error("Website publisher role assignment could not be restored");
      return { membershipCreated, assignmentCreated: true };
    }
    const actual = [...existingAssignment.capabilities].sort();
    const expected = [...siteWebsitePublisherCapabilities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("Existing website publisher assignment needs separate access review");
    }
    return { membershipCreated, assignmentCreated: false };
  }

  const [assignment] = await tx.insert(roleAssignments).values({
    personId: input.personId,
    organizationId: input.organizationId,
    siteId: input.siteId,
    programId: null,
    roleKey: "site_website_editor",
    capabilities: [...siteWebsitePublisherCapabilities],
    metadata: { purpose: "church_local_website_publishing" },
  }).returning({ id: roleAssignments.id });
  if (!assignment) throw new Error("Website publisher role assignment could not be created");
  return { membershipCreated, assignmentCreated: true };
}
