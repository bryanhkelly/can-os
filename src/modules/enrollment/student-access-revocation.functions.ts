import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
 accessSessions, accountPersonGrants, programs, studentAccessConsents, studentProfiles,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { recordSessionSecurityEvent } from "@/modules/identity/session-security-audit.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const revocationInput = z.object({
 grantId: uuid,
 reason: z.string().trim().min(10).max(500),
}).strict();

/** Same authorizer shape as student learning access provisioning. */
async function studentAccessRegistrar() {
 const actor = await getCommandContext(getRequest());
 if (actor.role !== "registrar" || !actor.actorPersonId || actor.demoFacilitator)
  throw new AuthorizationError("real school registrar");
 assertCapability(actor, "enrollment.activate");
 return actor;
}

/**
 * Lock and verify the exact student grant before any write. Only a real
 * registrar whose verified scope covers the grant's own Organization and Site
 * may touch it. Never mutates studentAccessConsents or people.active.
 */
async function scopedStudentGrant(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 actor: Awaited<ReturnType<typeof studentAccessRegistrar>>,
 grantId: string,
) {
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
 if (!grant || grant.role !== "student")
  throw new AuthorizationError("existing student learning access grant");
 if (!grant.organizationId || !actor.scope.organizationIds?.includes(grant.organizationId))
  throw new AuthorizationError("student grant organization scope");
 if (grant.siteId && !actor.scope.siteIds?.includes(grant.siteId))
  throw new AuthorizationError("student grant site scope");
 return grant;
}

/** Revoke sessions bound to this exact grant on the student's account. */
async function revokeBoundSessions(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 actor: Awaited<ReturnType<typeof studentAccessRegistrar>>,
 grant: Awaited<ReturnType<typeof scopedStudentGrant>>,
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
  role: "student",
  revokedCount: revoked.length,
 });
 return revoked.length;
}

/**
 * The independently reviewed guardian consent that originally authorized this
 * student's learning account must still be approved. The consent row links to
 * the student through its Student Profile and to the grant's Site; the
 * consent Program must belong to the grant's Organization.
 */
async function requireApprovedConsent(
 tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
 grant: Awaited<ReturnType<typeof scopedStudentGrant>>,
) {
 const [consent] = await tx.select({ id: studentAccessConsents.id })
  .from(studentAccessConsents)
  .innerJoin(studentProfiles, eq(studentProfiles.id, studentAccessConsents.studentProfileId))
  .innerJoin(programs, eq(programs.id, studentAccessConsents.programId))
  .where(and(
   eq(studentProfiles.personId, grant.personId),
   eq(studentAccessConsents.siteId, grant.siteId ?? ""),
   eq(programs.organizationId, grant.organizationId ?? ""),
   eq(studentAccessConsents.status, "approved"),
  )).limit(1);
 if (!consent)
  throw new AuthorizationError("approved guardian consent for this student learning access");
 return consent;
}

export const revokeStudentLearningAccess = createServerFn({ method: "POST" })
 .validator((value: unknown) => revocationInput.parse(value))
 .handler(async ({ data }) => {
  const actor = await studentAccessRegistrar();
  return db.transaction(async tx => {
   const grant = await scopedStudentGrant(tx, actor, data.grantId);
   // Idempotent: an already inactive grant is a no-op with no duplicate
   // audit or event history. Consent rows are never modified on revoke.
   if (!grant.active) return { revoked: false as const };
   const now = new Date();
   await tx.update(accountPersonGrants).set({ active: false, updatedAt: now })
    .where(eq(accountPersonGrants.id, grant.id));
   await revokeBoundSessions(tx, actor, grant);
   await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: "student.access.revoked",
    resourceType: "account_person_grant",
    resourceId: grant.id,
    scope: { organizationId: grant.organizationId, siteId: grant.siteId },
    before: { active: true },
    after: { active: false, reason: data.reason },
    context: { accountId: actor.accountId, sessionId: actor.sessionId, grantId: actor.grantId },
   });
   await emitEvent(tx, {
    eventType: EventTypes.StudentLearningAccessRevoked,
    aggregateType: "account_person_grant",
    aggregateId: grant.id,
    actorPersonId: actor.actorPersonId,
    organizationId: grant.organizationId,
    siteId: grant.siteId,
    payload: { personId: grant.personId, role: "student" },
   });
   return { revoked: true as const };
  });
 });

/**
 * Restoration reactivates the grant only while the original independently
 * reviewed guardian consent remains approved; revoked sessions stay revoked.
 */
export const restoreStudentLearningAccess = createServerFn({ method: "POST" })
 .validator((value: unknown) => revocationInput.parse(value))
 .handler(async ({ data }) => {
  const actor = await studentAccessRegistrar();
  return db.transaction(async tx => {
   const grant = await scopedStudentGrant(tx, actor, data.grantId);
   if (grant.active) return { restored: false as const };
   await requireApprovedConsent(tx, grant);
   const now = new Date();
   await tx.update(accountPersonGrants).set({ active: true, updatedAt: now })
    .where(eq(accountPersonGrants.id, grant.id));
   await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: "student.access.restored",
    resourceType: "account_person_grant",
    resourceId: grant.id,
    scope: { organizationId: grant.organizationId, siteId: grant.siteId },
    before: { active: false },
    after: { active: true, reason: data.reason },
    context: { accountId: actor.accountId, sessionId: actor.sessionId, grantId: actor.grantId },
   });
   await emitEvent(tx, {
    eventType: EventTypes.StudentLearningAccessRestored,
    aggregateType: "account_person_grant",
    aggregateId: grant.id,
    actorPersonId: actor.actorPersonId,
    organizationId: grant.organizationId,
    siteId: grant.siteId,
    payload: { personId: grant.personId, role: "student" },
   });
   return { restored: true as const };
  });
 });
