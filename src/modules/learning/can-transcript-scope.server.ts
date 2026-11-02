import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, programs, roleAssignments } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { requireInstitutionalAcademicProgramAuthority } from "@/modules/programs/program-site-authorization.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";

/**
 * A separate, exact-Program CAN record-issuer grant. It must never be copied
 * into the authenticated user's general Program/Site scope: those IDs belong
 * to the independently operated church, not to CAN.
 *
 * Source of authority:
 * - active, original CAN registrar account grant (the caller);
 * - CAN-owned RoleAssignment for this exact Program and issuance capability;
 * - church-owned Program with CAN both as provider and credit issuer;
 * - currently approved, evidence-verified Program-Site service entitlement.
 *
 * The reader is injectable to recheck and lock the grant within transcript
 * issuance's own transaction. Revocation and expiry must fail closed.
 */
export async function listDelegatedCANTranscriptPrograms(
  actor: AccessContext,
  reader: Pick<typeof db, "select"> = db,
): Promise<Array<{ programId: string; siteId: string }>> {
  const originalOrgs = actor.scope.organizationIds ?? [];
  if (actor.role !== "registrar" || !actor.actorPersonId ||
      actor.sessionAccountId || actor.grantSiteId !== null ||
      !actor.capabilities.has("enrollment:manage") ||
      originalOrgs.length !== 1) return [];

  const rows = await reader.select({
    programId: programs.id,
    siteId: programs.siteId,
  }).from(roleAssignments)
    .innerJoin(programs, eq(roleAssignments.programId, programs.id))
    .innerJoin(organizations, eq(organizations.id, programs.organizationId))
    .where(and(
      eq(roleAssignments.personId, actor.actorPersonId),
      eq(roleAssignments.roleKey, "registrar"),
      inArray(roleAssignments.organizationId, originalOrgs),
      eq(organizations.type, "church"),
      ne(programs.organizationId, roleAssignments.organizationId),
      or(isNull(programs.hostOrganizationId),
        eq(programs.hostOrganizationId, programs.organizationId)),
      eq(programs.academicProviderOrganizationId, roleAssignments.organizationId),
      eq(programs.creditIssuingOrganizationId, roleAssignments.organizationId),
      or(isNull(roleAssignments.siteId),
        eq(roleAssignments.siteId, programs.siteId)),
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify(["academic_records.issue"])}::jsonb`,
    ))
    // Hold active grant rows until the transaction issuing the record commits.
    .for("share", { of: roleAssignments });
  const allowed: Array<{programId:string;siteId:string}> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.siteId || seen.has(row.programId)) continue;
    try {
      await requireInstitutionalAcademicProgramAuthority(reader, actor, row.programId, [
        "school_of_record", "academic_records", "credit_issuance",
      ]);
      allowed.push({programId: row.programId, siteId: row.siteId});
      seen.add(row.programId);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }
  }
  return allowed;
}
