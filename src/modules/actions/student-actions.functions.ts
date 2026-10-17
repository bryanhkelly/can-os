import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, recordAudit, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
import {EventTypes} from "@/domain/event-types";

const studentActor = () => requireActor(["student"]);

export const getQuickWinActions = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await studentActor();
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  if (!process.env.DATABASE_URL) return { connected: false as const, actions: [] };
  const [{ db }, { actions, domainEvents }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"),
  ]);
  const rows = await db.select({
    id: actions.id, title: actions.title, description: actions.description,
    status: actions.status, priority: actions.priority, dueAt: actions.dueAt,
    metadata: actions.metadata, type: actions.type,
  }).from(actions).where(and(
    eq(actions.ownerPersonId, actor.actorPersonId),
    inArray(actions.siteId, sites),
    inArray(actions.programId, actor.scope.programIds ?? []),
  )).orderBy(desc(actions.createdAt)).limit(100);
  return { connected: true as const, actions: rows.map(row => ({ ...row, metadata: { source: typeof row.metadata.source === "string" ? row.metadata.source : row.type }, dueAt: row.dueAt?.toISOString() ?? null })) };
});

export const finishQuickWinAction = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ actionId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const actor = await studentActor();
    const sites = actorSiteIds(actor);
    if (!process.env.DATABASE_URL) throw new Error("Neon is not configured");
    const [{ db }, { actions, domainEvents }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"),
    ]);
    return db.transaction(async tx => {
      const [current] = await tx.select({id:actions.id,type:actions.type,subjectType:actions.subjectType,subjectId:actions.subjectId,programId:actions.programId}).from(actions).where(and(eq(actions.id,data.actionId),eq(actions.ownerPersonId,actor.actorPersonId),inArray(actions.siteId,sites),eq(actions.status,"open"))).for("update").limit(1);
      if(!current||!current.programId||!(actor.scope.programIds??[]).includes(current.programId))throw new AuthorizationError("open owned action in authorized program");
      if(!["student_recovery","student_support","student_support_request","conference_follow_up"].includes(current.type))throw new AuthorizationError("Action requires its owning workflow");
      const [result] = await tx.update(actions).set({
        status: "resolved", resolvedAt: new Date(), resolutionNote: "Completed by owner",
        updatedAt: new Date(),
      }).where(and(
        eq(actions.id, data.actionId),
        eq(actions.ownerPersonId, actor.actorPersonId),
        inArray(actions.siteId, sites),
        eq(actions.status, "open"),
      )).returning({ id: actions.id });
      if (!result) throw new Error("Action not found or already completed");
      await tx.insert(domainEvents).values({eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:result.id,actorPersonId:actor.actorPersonId,payload:{subjectType:current.subjectType,subjectId:current.subjectId}});
      await recordAudit(tx, actor, { action: "action.complete", resourceType: "action", resourceId: result.id, before: { status: "open" }, after: { status: "resolved" } });
      return { id: result.id };
    });
  });

export const requestQuickWinHelp = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ message: z.string().trim().min(3, "Help request must be between 3 and 1000 characters").max(1000, "Help request must be between 3 and 1000 characters") }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    const sites = actorSiteIds(actor);
    if (!process.env.DATABASE_URL) throw new Error("Neon is not configured");
    const [{ db }, s] = await Promise.all([
      import("@/db/client"), import("@/db/schema"),
    ]);
    return db.transaction(async tx => {
      const [profile] = await tx.select({ id: s.studentProfiles.id }).from(s.studentProfiles).where(eq(s.studentProfiles.personId, actor.actorPersonId)).limit(1);
      if (!profile) throw new AuthorizationError("student profile");
      const [enrollment] = await tx.select({ organizationId: s.enrollments.organizationId, programId: s.enrollments.programId, siteId:s.programs.siteId })
        .from(s.enrollments).innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
        .where(and(eq(s.enrollments.studentProfileId, profile.id), eq(s.enrollments.status, "active"), inArray(s.programs.siteId, sites), inArray(s.enrollments.programId, actor.scope.programIds ?? []))).limit(1);
      if (!enrollment) throw new AuthorizationError("active program enrollment");
      const [result] = await tx.insert(s.actions).values({
        type: "student_support_request", title: "Student asked for help",
        description: data.message, ownerPersonId: actor.actorPersonId,
        organizationId: enrollment.organizationId, siteId: enrollment.siteId, programId: enrollment.programId,
        subjectType: "student_profile", subjectId: profile.id,
        status: "open", priority: "normal",
        metadata: { kind: "message", source: "Student support" },
      }).returning({ id: s.actions.id });
      if (!result) throw new Error("Help request could not be saved");
      await tx.insert(s.domainEvents).values({eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:result.id,actorPersonId:actor.actorPersonId,payload:{subjectType:"student_profile",subjectId:profile.id,source:"student_support_request"}});
      await recordAudit(tx, actor, { action: "support_request.create", resourceType: "action", resourceId: result.id, after: { kind: "message" } });
      return { id: result.id };
    });
  });
