import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessSessions, accountPersonGrants } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { recordSessionSecurityEvent } from "@/modules/identity/session-security-audit.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { registrar as admissionsRegistrar } from "./admissions-intake.functions";

const uuid = z.string().uuid();
const revocationInput = z.object({
 grantId: uuid,
 reason: z.string().trim().min(10).max(500),
}).strict();

/**
 * Lock and verify the exact guardian grant before any write. Only a real
 * admissions registrar of the grant's own Organization (and Site, when the
 * grant is site-bound) may touch it; demo facilitators and self-service are
 * refused. Never mutates guardianRelationships or people.active.
 */
async function scopedGuardianGrant(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 actor: Awaited<ReturnType<typeof admissionsRegistrar>>,
 grantId: string,
) {
 if (actor.demoFacilitator) throw new AuthorizationError("real school registrar");
 if (grantId === actor.grantId)
  throw new AuthorizationError("registrar cannot revoke their own active grant");
 const [grant] = await tx.select({
  id: accountPersonGrants.id,
  accountId: accountPersonGrants.accountId,
  personId: accountPersonGrants.personId,
  role: accountPersonGrants.role,
  organizationId: accountPersonGrants.organizationId,
  siteId: accountPersonGrants.siteId,
  active: accountPersonGrants.active,
 }).from(accountPersonGrants).where(eq(accountPersonGrants.id, grantId))
  .for("update").limit(1);
 if (!grant || grant.role !== "guardian")
  throw new AuthorizationError("existing guardian access grant");
 if (!grant.organizationId || !actor.scope.organizationIds?.includes(grant.organizationId))
  throw new AuthorizationError("guardian grant organization scope");
 if (grant.siteId && !actor.scope.siteIds?.includes(grant.siteId))
  throw new AuthorizationError("guardian grant site scope");
 return grant;
}

/** Revoke sessions bound to this exact grant on the grantee's account. */
async function revokeBoundSessions(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 actor: Awaited<ReturnType<typeof admissionsRegistrar>>,
 grant: Awaited<ReturnType<typeof scopedGuardianGrant>>,
) {
 const now = new Date();
 const revoked = await tx.update(accessSessions).set({ revokedAt: now, updatedAt: now })
  .where(and(
   eq(accessSessions.accountId, grant.accountId),
   eq(accessSessions.activeGrantId, grant.id),
   isNull(accessSessions.revokedAt),
  )).returning({ id: accessSessions.id });
 if (revoked.length) await recordSessionSecurityEvent(tx, {
  action: "identity.sessions.revoked_grant",
  accountId: grant.accountId,
  actorPersonId: actor.actorPersonId,
  sessionId: actor.sessionId,
  grantId: grant.id,
  role: "guardian",
  revokedCount: revoked.length,
 });
 return revoked.length;
}

export const revokeAdmissionsGuardianAccess = createServerFn({ method: "POST" })
 .validator((value: unknown) => revocationInput.parse(value))
 .handler(async ({ data }) => {
  const actor = await admissionsRegistrar();
  return db.transaction(async tx => {
   const grant = await scopedGuardianGrant(tx, actor, data.grantId);
   // Idempotent: an already inactive grant is a no-op with no duplicate
   // audit or event history.
   if (!grant.active) return { revoked: false as const };
   const now = new Date();
   await tx.update(accountPersonGrants).set({ active: false, updatedAt: now })
    .where(eq(accountPersonGrants.id, grant.id));
   await revokeBoundSessions(tx, actor, grant);
   await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: "admissions.guardian_access.revoked",
    resourceType: "account_person_grant",
    resourceId: grant.id,
    scope: { organizationId: grant.organizationId, siteId: grant.siteId },
    before: { active: true },
    after: { active: false, reason: data.reason },
    context: { accountId: actor.accountId, sessionId: actor.sessionId, grantId: actor.grantId },
   });
   await emitEvent(tx, {
    eventType: EventTypes.GuardianAccessRevoked,
    aggregateType: "account_person_grant",
    aggregateId: grant.id,
    actorPersonId: actor.actorPersonId,
    organizationId: grant.organizationId,
    siteId: grant.siteId,
    payload: { personId: grant.personId, role: "guardian" },
   });
   return { revoked: true as const };
  });
 });

/** Restoration reactivates the grant only; previously revoked sessions stay revoked. */
export const restoreAdmissionsGuardianAccess = createServerFn({ method: "POST" })
 .validator((value: unknown) => revocationInput.parse(value))
 .handler(async ({ data }) => {
  const actor = await admissionsRegistrar();
  return db.transaction(async tx => {
   const grant = await scopedGuardianGrant(tx, actor, data.grantId);
   if (grant.active) return { restored: false as const };
   const now = new Date();
   await tx.update(accountPersonGrants).set({ active: true, updatedAt: now })
    .where(eq(accountPersonGrants.id, grant.id));
   await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: "admissions.guardian_access.restored",
    resourceType: "account_person_grant",
    resourceId: grant.id,
    scope: { organizationId: grant.organizationId, siteId: grant.siteId },
    before: { active: false },
    after: { active: true, reason: data.reason },
    context: { accountId: actor.accountId, sessionId: actor.sessionId, grantId: actor.grantId },
   });
   await emitEvent(tx, {
    eventType: EventTypes.GuardianAccessRestored,
    aggregateType: "account_person_grant",
    aggregateId: grant.id,
    actorPersonId: actor.actorPersonId,
    organizationId: grant.organizationId,
    siteId: grant.siteId,
    payload: { personId: grant.personId, role: "guardian" },
   });
   return { restored: true as const };
  });
 });
