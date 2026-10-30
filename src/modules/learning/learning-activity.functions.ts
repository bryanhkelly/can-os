import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { classResources, readClassContent } from "@/domain/class-content";
import { AuthorizationError } from "@/domain/command-context";
import { sessionIdleCutoff } from "@/domain/access-tokens";
import {
  estimateActiveLearningMilliseconds, learnerInteractionInputSchema,
  parseLearnerInteraction,
} from "@/domain/learning-activity-policy";

async function loadLearningStore() {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return { db, s };
}

const sessionInput = z.object({ sectionId: z.string().uuid() }).strict();
const eventInput = z.object({
  learningSessionId: z.string().uuid(),
  interaction: learnerInteractionInputSchema,
}).strict();
const historyInput = sessionInput.extend({ studentPersonId: z.string().uuid().optional() });

/**
 * Authenticated student sessions are separate from authentication cookies.
 * Only active, enrolled students may begin tracking a published Section.
 */
export const startLearningActivitySession = createServerFn({ method: "POST" })
  .validator((value: unknown) => sessionInput.parse(value))
  .handler(async ({ data }) => {
    const { classActor, authorizeClass } = await import("./class-access.server");
    const actor = await classActor();
    if (actor.role !== "student") throw new AuthorizationError("student learning session");
    const { db, s } = await loadLearningStore();
    const { recordAudit } = await import("@/modules/identity/actors.server");
    return db.transaction(async tx => {
      // Defend the learner-session boundary even if a previously valid
      // browser session or selected grant has since been revoked.
      const now = new Date();
      const [login] = await tx.select({ id: s.accessSessions.id })
        .from(s.accessSessions)
        .innerJoin(s.accessAccounts, eq(s.accessAccounts.id, s.accessSessions.accountId))
        .where(and(
          eq(s.accessSessions.id, actor.sessionId),
          eq(s.accessSessions.accountId, actor.accountId),
          eq(s.accessSessions.activeGrantId, actor.grantId),
          isNull(s.accessSessions.revokedAt),
          gt(s.accessSessions.expiresAt, now),
          gt(s.accessSessions.updatedAt, sessionIdleCutoff(now)),
          eq(s.accessAccounts.disabled, false),
        )).limit(1);
      if (!login) throw new AuthorizationError("active learner login session");
      const { section, studentProfileId } = await authorizeClass(actor, data.sectionId, undefined, tx);
      if (!studentProfileId || !section.siteId || section.contentStatus !== "published" ||
          !readClassContent(section.curriculum)) {
        throw new AuthorizationError("published enrolled class");
      }
      const [created] = await tx.insert(s.learningActivitySessions).values({
        accessSessionId: actor.sessionId,
        studentProfileId,
        siteId: section.siteId,
        programId: section.programId,
        sectionId: section.id,
        courseTemplateVersionId: section.versionId,
      }).returning({ id: s.learningActivitySessions.id });
      if (!created) throw new Error("Unable to start learning activity session");
      await recordAudit(tx, actor, {
        action: "learning.session.started",
        resourceType: "learning_activity_session", resourceId: created.id,
        scope: { siteId: section.siteId, programId: section.programId, sectionId: section.id },
      });
      return { learningSessionId: created.id, sectionId: section.id, versionId: section.versionId };
    });
  });

/**
 * Append one small, typed, idempotent interaction. Security session, current
 * enrollment, published content, course version and resource membership are
 * revalidated on every event; client fields never set the student or scope.
 *
 * A row lock serializes observed-time estimates and identical client event IDs.
 * No event updates attendance, grades, official credit or lesson completion.
 */
export const recordLearningInteraction = createServerFn({ method: "POST" })
  .validator((value: unknown) => eventInput.parse(value))
  .handler(async ({ data }) => {
    const { classActor, authorizeClass } = await import("./class-access.server");
    const actor = await classActor();
    if (actor.role !== "student") throw new AuthorizationError("student learning interaction");
    const { db, s } = await loadLearningStore();
    return db.transaction(async tx => {
      const now = new Date();
      const [login] = await tx.select({ id: s.accessSessions.id })
        .from(s.accessSessions)
        .innerJoin(s.accessAccounts, eq(s.accessAccounts.id, s.accessSessions.accountId))
        .where(and(
          eq(s.accessSessions.id, actor.sessionId),
          eq(s.accessSessions.accountId, actor.accountId),
          eq(s.accessSessions.activeGrantId, actor.grantId),
          isNull(s.accessSessions.revokedAt),
          gt(s.accessSessions.expiresAt, now),
          gt(s.accessSessions.updatedAt, sessionIdleCutoff(now)),
          eq(s.accessAccounts.disabled, false),
        )).limit(1);
      if (!login) throw new AuthorizationError("active learner login session");
      const { section, studentProfileId } = await authorizeClass(actor, data.interaction.sectionId, undefined, tx);
      if (!studentProfileId || !section.siteId || section.contentStatus !== "published") {
        throw new AuthorizationError("published enrolled class");
      }
      const content = readClassContent(section.curriculum);
      if (!content) throw new AuthorizationError("published lesson content");
      const lesson = content.modules.flatMap(module => module.lessons)
        .find(candidate => candidate.id === data.interaction.lessonId);
      if (!lesson) throw new AuthorizationError("published lesson");
      if (data.interaction.kind === "resource_opened") {
        const resourceId = data.interaction.resourceId;
        if (!classResources(content).some(resource =>
            resource.id === resourceId &&
            (lesson.resources.some(item => item.id === resource.id) ||
             content.resources.some(item => item.id === resource.id)))) {
          throw new AuthorizationError("published lesson resource");
        }
      }
      const [learningSession] = await tx.select().from(s.learningActivitySessions)
        .where(and(
          eq(s.learningActivitySessions.id, data.learningSessionId),
          eq(s.learningActivitySessions.accessSessionId, actor.sessionId),
          eq(s.learningActivitySessions.studentProfileId, studentProfileId),
          eq(s.learningActivitySessions.sectionId, section.id),
          eq(s.learningActivitySessions.courseTemplateVersionId, section.versionId),
        )).limit(1).for("update");
      if (!learningSession) throw new AuthorizationError("owned learning session");
      const digest = createHash("sha256").update(JSON.stringify(data.interaction)).digest("hex");
      const [previousEvent] = await tx.select({
        id: s.learningActivityEvents.id, requestDigest: s.learningActivityEvents.requestDigest,
        estimatedActiveMs: s.learningActivityEvents.estimatedActiveMs,
      }).from(s.learningActivityEvents).where(and(
        eq(s.learningActivityEvents.learningSessionId, learningSession.id),
        eq(s.learningActivityEvents.clientEventId, data.interaction.clientEventId),
      )).limit(1);
      if (previousEvent) {
        if (previousEvent.requestDigest !== digest) throw new Error("Conflicting learning event retry");
        return { recorded: true, duplicate: true, estimatedActiveMs: previousEvent.estimatedActiveMs };
      }
      if (learningSession.endedAt) throw new AuthorizationError("ended learning session");
      if (now.getTime() - learningSession.startedAt.getTime() > 12 * 60 * 60 * 1000 ||
          (learningSession.lastInteractionAt &&
           now.getTime() - learningSession.lastInteractionAt.getTime() > 30 * 60 * 1000)) {
        throw new AuthorizationError("expired learning session");
      }
      const interaction = parseLearnerInteraction(data.interaction, now);
      const estimatedActiveMs = interaction.kind === "engaged_interval" &&
          learningSession.lastLessonId === interaction.lessonId ?
        estimateActiveLearningMilliseconds({
          previousReceivedAt: learningSession.lastInteractionAt, receivedAt: now,
          reportedDurationMs: interaction.durationMs,
          previousForeground: learningSession.lastForeground,
          currentForeground: interaction.pageVisible && interaction.windowFocused,
        }) : 0;
      const [inserted] = await tx.insert(s.learningActivityEvents).values({
        learningSessionId: learningSession.id, studentProfileId,
        sectionId: section.id, courseTemplateVersionId: section.versionId,
        lessonId: interaction.lessonId,
        resourceId: interaction.kind === "resource_opened" ? interaction.resourceId : null,
        kind: interaction.kind, clientEventId: interaction.clientEventId, requestDigest: digest,
        reportedAt: new Date(interaction.occurredAt), receivedAt: now, estimatedActiveMs,
      }).returning({ id: s.learningActivityEvents.id });
      if (!inserted) throw new Error("Unable to save learning activity evidence");
      await tx.update(s.learningActivitySessions).set({
        lastInteractionAt: now, lastForeground: true, lastLessonId: interaction.lessonId,
        estimatedActiveMs: learningSession.estimatedActiveMs + estimatedActiveMs,
      }).where(eq(s.learningActivitySessions.id, learningSession.id));
      return { recorded: true, duplicate: false, estimatedActiveMs };
    });
  });

/**
 * Read only the verified student's own timeline, a related guardian's student,
 * or an assigned teacher's currently enrolled student. Returns evidence, not
 * academic judgments, and never another class's records.
 */
export const getLearningActivityHistory = createServerFn({ method: "GET" })
  .validator((value: unknown) => historyInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { classActor, authorizeClass } = await import("./class-access.server");
    const actor = await classActor();
    const { db, s } = await loadLearningStore();
    const { section, studentProfileId } = await authorizeClass(actor, data.sectionId, data.studentPersonId);
    let profileId = studentProfileId;
    if (actor.role === "teacher") {
      if (!data.studentPersonId) throw new AuthorizationError("selected enrolled student");
      const [enrollment] = await db.select({ id: s.studentProfiles.id })
        .from(s.enrollments).innerJoin(s.studentProfiles,
          eq(s.enrollments.studentProfileId, s.studentProfiles.id))
        .where(and(
          eq(s.studentProfiles.personId, data.studentPersonId),
          eq(s.enrollments.sectionId, section.id),
          eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
        )).limit(1);
      profileId = enrollment?.id ?? null;
    }
    if (!profileId) throw new AuthorizationError("student enrollment");
    const rows = await db.select({
      id: s.learningActivityEvents.id, kind: s.learningActivityEvents.kind,
      lessonId: s.learningActivityEvents.lessonId, resourceId: s.learningActivityEvents.resourceId,
      receivedAt: s.learningActivityEvents.receivedAt,
      estimatedActiveMs: s.learningActivityEvents.estimatedActiveMs,
    }).from(s.learningActivityEvents)
      .where(and(eq(s.learningActivityEvents.studentProfileId, profileId),
        eq(s.learningActivityEvents.sectionId, section.id),
        eq(s.learningActivityEvents.courseTemplateVersionId, section.versionId)))
      .orderBy(desc(s.learningActivityEvents.receivedAt)).limit(100);
    return { sectionId: section.id, studentProfileId: profileId, evidence: rows.map(row => ({
      id: row.id, kind: row.kind, lessonId: row.lessonId, resourceId: row.resourceId,
      receivedAt: row.receivedAt.toISOString(), estimatedActiveMs: row.estimatedActiveMs,
    })) };
  });

export const endLearningActivitySession = createServerFn({ method: "POST" })
  .validator((value: unknown) => sessionInput.extend({ learningSessionId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const { classActor, authorizeClass } = await import("./class-access.server");
    const actor = await classActor();
    if (actor.role !== "student") throw new AuthorizationError("student learning session");
    const { section, studentProfileId } = await authorizeClass(actor, data.sectionId);
    if (!studentProfileId) throw new AuthorizationError("student enrollment");
    const { db, s } = await loadLearningStore();
    return db.transaction(async tx => {
      const [closed] = await tx.update(s.learningActivitySessions).set({ endedAt: new Date() })
        .where(and(
          eq(s.learningActivitySessions.id, data.learningSessionId),
          eq(s.learningActivitySessions.accessSessionId, actor.sessionId),
          eq(s.learningActivitySessions.studentProfileId, studentProfileId),
          eq(s.learningActivitySessions.sectionId, section.id),
          eq(s.learningActivitySessions.courseTemplateVersionId, section.versionId),
          isNull(s.learningActivitySessions.endedAt),
        ))
        .returning({ id: s.learningActivitySessions.id });
      return { closed: Boolean(closed) };
    });
  });
