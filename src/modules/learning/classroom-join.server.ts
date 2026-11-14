import { randomInt } from "node:crypto";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import {
  canTransitionSessionStatus,
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  evaluateSessionJoin,
  joinCodeExpiry,
  normalizeClassCode,
  shouldRevokeAfterFailedAttempt,
  type ClassroomSessionStatus,
} from "@/domain/classroom-sessions";
import { AuthorizationError } from "@/domain/command-context";
import { recordAudit, type Actor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { and, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Roles that may open, present and close a classroom session. */
export const CLASSROOM_FACILITATOR_ROLES = [
  "teacher", "site_admin", "site_leader", "room_facilitator",
] as const;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
    code += CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)];
  }
  return code;
}

/** Insert a fresh active join token, retrying on the unique code index. */
async function insertJoinToken(tx: Tx, sessionId: string, now: Date) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const [token] = await tx.insert(s.classroomJoinTokens).values({
        sessionId, code, status: "active", expiresAt: joinCodeExpiry(now),
      }).returning({ id: s.classroomJoinTokens.id, code: s.classroomJoinTokens.code });
      if (token) return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("classroom_join_token_code_uq") || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to issue a join code");
}

/**
 * Resolve a classroom session the actor may facilitate: the assigned
 * facilitator, or a site-scoped administrator at the session's site.
 */
export async function facilitatedClassroomSession(tx: Tx, actor: Actor, sessionId: string) {
  const [session] = await tx.select().from(s.classroomSessions)
    .where(eq(s.classroomSessions.id, sessionId)).for("update").limit(1);
  if (!session) throw new Error("Classroom session not found");
  const isFacilitator = session.facilitatorPersonId === actor.actorPersonId;
  const isSiteAdmin = !isFacilitator && session.siteId !== null &&
    ["site_admin", "site_leader"].includes(actor.role) &&
    (actor.scope.siteIds ?? []).includes(session.siteId);
  if (!isFacilitator && !isSiteAdmin) throw new AuthorizationError("classroom facilitator");
  return session;
}

/** Open a session directly into the live state and issue its first join code. */
export async function openClassroomSessionForActor(
  actor: Actor,
  input: { title: string; siteId?: string | null },
) {
  const now = new Date();
  return db.transaction(async tx => {
    if (input.siteId && !(actor.scope.siteIds ?? []).includes(input.siteId)) {
      throw new AuthorizationError("site scope");
    }
    const [session] = await tx.insert(s.classroomSessions).values({
      title: input.title,
      siteId: input.siteId ?? null,
      status: "open",
      facilitatorPersonId: actor.actorPersonId,
      openedAt: now,
    }).returning({ id: s.classroomSessions.id, title: s.classroomSessions.title });
    if (!session) throw new Error("Unable to open classroom session");
    const token = await insertJoinToken(tx, session.id, now);
    await recordAudit(tx, actor, {
      action: "classroom.session.open", resourceType: "classroom_session", resourceId: session.id,
      scope: { siteId: input.siteId ?? null },
      after: { title: session.title },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ClassroomSessionOpened,
      aggregateType: "classroom_session", aggregateId: session.id,
      actorPersonId: actor.actorPersonId,
      payload: { siteId: input.siteId ?? null },
    });
    return { sessionId: session.id, title: session.title, code: token.code };
  });
}

/** Rotate the displayed code: the previous token is retired immediately. */
export async function rotateClassroomJoinCodeForActor(actor: Actor, sessionId: string) {
  const now = new Date();
  return db.transaction(async tx => {
    const session = await facilitatedClassroomSession(tx, actor, sessionId);
    if (session.status !== "open") throw new Error("Only an open session can rotate its join code");
    await tx.update(s.classroomJoinTokens).set({
      status: "rotated", rotatedAt: now, updatedAt: now,
    }).where(and(
      eq(s.classroomJoinTokens.sessionId, session.id),
      eq(s.classroomJoinTokens.status, "active"),
    ));
    const token = await insertJoinToken(tx, session.id, now);
    await recordAudit(tx, actor, {
      action: "classroom.join_code.rotate", resourceType: "classroom_session",
      resourceId: session.id, scope: { siteId: session.siteId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ClassroomJoinCodeRotated,
      aggregateType: "classroom_session", aggregateId: session.id,
      actorPersonId: actor.actorPersonId, payload: {},
    });
    return { code: token.code, expiresAt: joinCodeExpiry(now).toISOString() };
  });
}

/** End an open session. Joining is closed; existing participant records persist. */
export async function endClassroomSessionForActor(actor: Actor, sessionId: string) {
  const now = new Date();
  return db.transaction(async tx => {
    const session = await facilitatedClassroomSession(tx, actor, sessionId);
    if (!canTransitionSessionStatus(session.status, "ended")) {
      throw new Error(`Session cannot be ended from ${session.status}`);
    }
    await tx.update(s.classroomSessions).set({
      status: "ended", endedAt: now, updatedAt: now,
    }).where(eq(s.classroomSessions.id, session.id));
    await tx.update(s.classroomJoinTokens).set({
      status: "revoked", revokedAt: now, updatedAt: now,
    }).where(and(
      eq(s.classroomJoinTokens.sessionId, session.id),
      eq(s.classroomJoinTokens.status, "active"),
    ));
    await recordAudit(tx, actor, {
      action: "classroom.session.end", resourceType: "classroom_session",
      resourceId: session.id, scope: { siteId: session.siteId },
      before: { status: session.status }, after: { status: "ended" },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ClassroomSessionEnded,
      aggregateType: "classroom_session", aggregateId: session.id,
      actorPersonId: actor.actorPersonId, payload: {},
    });
    return { ended: true };
  });
}

/**
 * Eligibility for a paired learner join. When the session is site-scoped,
 * the learner needs an active enrollment at that site; enrollment-free
 * sessions (pre-configuration slice) accept any authenticated person.
 * Guest joining (spec §13.4) remains a pending decision and is not implemented.
 */
async function assertJoinEligibility(tx: Tx, actor: Actor, session: { siteId: string | null }) {
  if (!session.siteId) return;
  const [enrollment] = await tx.select({ id: s.enrollments.id })
    .from(s.enrollments)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .where(and(
      eq(s.studentProfiles.personId, actor.actorPersonId),
      eq(s.enrollments.status, "active"),
      eq(s.enrollments.kind, "program"),
      eq(s.programs.siteId, session.siteId),
    )).limit(1);
  if (!enrollment) throw new AuthorizationError("enrollment at this classroom site");
}

/**
 * Join an open session by class code. Returns the stable participant; retries
 * with the same idempotency key return the original result without creating
 * duplicate participants or connections.
 */
export async function joinClassroomSessionForActor(
  actor: Actor,
  input: { code: string; deviceKey: string; idempotencyKey: string },
) {
  const code = normalizeClassCode(input.code);
  const now = new Date();
  return db.transaction(async tx => {
    const [token] = await tx.select({
      id: s.classroomJoinTokens.id,
      sessionId: s.classroomJoinTokens.sessionId,
      status: s.classroomJoinTokens.status,
      expiresAt: s.classroomJoinTokens.expiresAt,
      failedAttempts: s.classroomJoinTokens.failedAttempts,
    }).from(s.classroomJoinTokens).where(eq(s.classroomJoinTokens.code, code)).for("update").limit(1);

    // Unknown codes get one generic message; session existence is not enumerable.
    if (!token) throw new Error("That class code is not valid");

    const [session] = await tx.select().from(s.classroomSessions)
      .where(eq(s.classroomSessions.id, token.sessionId)).limit(1);
    if (!session) throw new Error("That class code is not valid");

    const verdict = evaluateSessionJoin(session.status as ClassroomSessionStatus, token, now);
    if (!verdict.ok) {
      // Count only resolved-session failures; revoke after the threshold so a
      // probed code cannot be brute-forced open.
      const failedAttempts = token.failedAttempts + 1;
      await tx.update(s.classroomJoinTokens).set({
        failedAttempts,
        ...(shouldRevokeAfterFailedAttempt(token.failedAttempts)
          ? { status: "revoked", revokedAt: now } : {}),
        updatedAt: now,
      }).where(eq(s.classroomJoinTokens.id, token.id));
      throw new Error("That class code is not valid");
    }

    await assertJoinEligibility(tx, actor, session);

    const [participant] = await tx.insert(s.classroomSessionParticipants).values({
      sessionId: session.id, personId: actor.actorPersonId,
    }).onConflictDoUpdate({
      target: [s.classroomSessionParticipants.sessionId, s.classroomSessionParticipants.personId],
      set: { updatedAt: now },
    }).returning({
      id: s.classroomSessionParticipants.id,
      joinedAt: s.classroomSessionParticipants.joinedAt,
    });
    if (!participant) throw new Error("Unable to join classroom session");

    const [connection] = await tx.insert(s.classroomSessionConnections).values({
      participantId: participant.id, deviceKey: input.deviceKey,
      idempotencyKey: input.idempotencyKey,
    }).onConflictDoUpdate({
      target: [s.classroomSessionConnections.idempotencyKey],
      set: { connectedAt: now, disconnectedAt: null, updatedAt: now },
    }).returning({ id: s.classroomSessionConnections.id });
    if (!connection) throw new Error("Unable to join classroom session");

    await recordAudit(tx, actor, {
      action: "classroom.session.join", resourceType: "classroom_session",
      resourceId: session.id, scope: { siteId: session.siteId },
      after: { participantId: participant.id, connectionId: connection.id },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ClassroomSessionJoined,
      aggregateType: "classroom_session", aggregateId: session.id,
      actorPersonId: actor.actorPersonId,
      payload: { participantId: participant.id },
    });
    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      participantId: participant.id,
      joinedAt: participant.joinedAt.toISOString(),
    };
  });
}

/** Facilitator presentation payload: aggregate counts only, no learner identity. */
export async function classroomPresentationForActor(actor: Actor, sessionId: string) {
  return db.transaction(async tx => {
    const session = await facilitatedClassroomSession(tx, actor, sessionId);
    const [token] = await tx.select({
      code: s.classroomJoinTokens.code,
      status: s.classroomJoinTokens.status,
      expiresAt: s.classroomJoinTokens.expiresAt,
    }).from(s.classroomJoinTokens)
      .where(and(eq(s.classroomJoinTokens.sessionId, session.id),
        eq(s.classroomJoinTokens.status, "active")))
      .orderBy(sql`${s.classroomJoinTokens.createdAt} desc`).limit(1);
    const [count] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(s.classroomSessionParticipants)
      .where(eq(s.classroomSessionParticipants.sessionId, session.id));
    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      code: token?.code ?? null,
      joinCodeExpiresAt: token?.expiresAt.toISOString() ?? null,
      participantCount: count?.count ?? 0,
    };
  });
}
