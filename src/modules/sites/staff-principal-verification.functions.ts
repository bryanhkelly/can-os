import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, accessAccountCanonicalPrincipals } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { writeAudit } from "@/platform/mutation";
import { assertCANIdentityReviewer } from "@/domain/site-identity-review";

/**
 * P0 one-Person retirement. There is ONE public.people identity.
 * Never create another verified CAN-to-native Person correspondence.
 *
 * The old creation command remains only as a fail-closed compatibility
 * endpoint while clients move to ordinary verified CAN account grants.
 */
export const verifyCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    throw new AuthorizationError("retired native Person correspondence");
  });

async function requireCANReviewer() {
  const actor=await getCommandContext(getRequest());
  const orgId=actor.scope.organizationIds?.length===1?actor.scope.organizationIds[0]:null;
  const [organization]=orgId?await db.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,orgId)).limit(1):[];
  assertCANIdentityReviewer(actor,organization);
  return actor;
}

/**
 * Historical revocation only: preserve signed reviewer audit evidence.
 * Does not create a Person, account, staff grant, or new correspondence.
 * This can retire entirely once all existing references are removed.
 */
export const revokeCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .validator((v:unknown) => z.object({
    publicAccountId: z.string().uuid(),
    reason: z.string().trim().min(25).max(1200),
  }).strict().parse(v))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const reviewer = await requireCANReviewer();
    if (!reviewer.accountId || reviewer.sessionAccountId ||
        reviewer.accountId === data.publicAccountId) {
      throw new AuthorizationError("independent CAN identity reviewer");
    }
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-source:" + data.publicAccountId}))`);
      const [current] = await tx.select({
        id: accessAccountCanonicalPrincipals.id,
        canonicalPersonId: accessAccountCanonicalPrincipals.canonicalPrincipalId,
      }).from(accessAccountCanonicalPrincipals).where(and(
        eq(accessAccountCanonicalPrincipals.accountId, data.publicAccountId),
        isNull(accessAccountCanonicalPrincipals.revokedAt),
      )).for("update").limit(1);
      if (!current) return {revoked: false as const};
      await tx.update(accessAccountCanonicalPrincipals).set({
        revokedAt: new Date(),
      }).where(eq(accessAccountCanonicalPrincipals.id, current.id));
      await writeAudit(tx, reviewer, {
        action: "identity.canonical_staff.revoked",
        entityType: "access_account_canonical_principal", entityId: current.id,
        before: { canonicalPersonId: current.canonicalPersonId, status: "active" },
        after: { status: "revoked", reason: data.reason },
      });
      return {revoked: true as const};
    });
  });
