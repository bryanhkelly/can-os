import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { isVerifiedCanSitePlanning } from "./verified-site-planning.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuditEntry = Parameters<typeof writeCanonicalAudit>[1];
type DomainEntry = Parameters<typeof emitCanonicalDomainEvent>[1];

/**
 * One atomic public.audit_events + public.domain_events journal write.
 *
 * Verified CAN Site planners use the shared platform writers and their
 * existing owner-Site recheck in the enclosing transaction. Delegated native
 * author/reviewer operations run under SET LOCAL ROLE and use a narrowly
 * granted database journal gateway, not an owner bypass or legacy table.
 *
 * No additional audit/outbox table is created.
 */
export async function writeBlueprintTransition(
  tx: Tx,
  context: CommandContext,
  audit: AuditEntry,
  event: DomainEntry,
): Promise<void> {
  const actor = context.actorPersonId;
  if (!actor || actor !== audit.actorPersonId || actor !== event.actorPersonId ||
      !audit.owningOrganizationId ||
      !context.scope.organizationIds?.includes(audit.owningOrganizationId)) {
    throw new AuthorizationError("Blueprint event actor and Organization scope");
  }

  if (isVerifiedCanSitePlanning(context)) {
    if (!context.capabilities.has("blueprint.configure") ||
        !["blueprint.configuration.created", "blueprint.configuration.saved",
          "blueprint.configuration.submitted"].includes(audit.eventCode)) {
      throw new AuthorizationError("verified CAN planning cannot review or execute");
    }
    await writeCanonicalAudit(tx, audit);
    await emitCanonicalDomainEvent(tx, event);
    return;
  }

  // The caller has already SET LOCAL ROLE to the exact verified Organization
  // purpose. The function independently rechecks that purpose, Organization,
  // entity lineage and allowed action; it inserts into existing public journals.
  await tx.execute(sql`
    SELECT public.append_restricted_blueprint_transition(
      ${audit.eventCode}::text, ${audit.entityKind}::text,
      ${audit.entityId}::uuid, ${actor}::uuid,
      ${audit.owningOrganizationId}::uuid,
      ${JSON.stringify(audit.payload ?? {})}::jsonb,
      ${event.eventType}::text, ${event.aggregateType}::text,
      ${event.aggregateId}::uuid,
      ${JSON.stringify(event.payload ?? {})}::jsonb
    )
  `);
}
