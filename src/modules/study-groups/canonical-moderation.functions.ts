import { db } from "@/db/client";
import * as s from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { validateGroupPost } from "@/domain/study-groups";
import { recordAudit,requireActor } from "@/modules/identity/actors.server";
import { emitEvent,notify } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { and,eq,inArray,sql } from "drizzle-orm";
import { z } from "zod";
import { facilitatedGroup,participatingStudent } from "./canonical-membership.server";

const uuid = z.string().uuid();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const createCanonicalGroupPost = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    groupId: uuid, body: z.string().min(1).max(3000),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student", "teacher"]);
    const body = validateGroupPost(data.body);
    return db.transaction(async tx => {
      const group = actor.role === "student"
        ? await participatingStudent(tx, actor, data.groupId)
        : await facilitatedGroup(tx, actor, data.groupId);
      // Throttle rapid duplicate submissions without exposing membership or
      // posts outside the authorized school (ported from the legacy path).
      const [recent] = await tx.select({ id: s.studyGroupPosts.id })
        .from(s.studyGroupPosts).where(and(
          eq(s.studyGroupPosts.groupId, group.id),
          eq(s.studyGroupPosts.authorPersonId, actor.actorPersonId),
          sql`${s.studyGroupPosts.createdAt} >= now() - interval '15 seconds'`,
        )).limit(1);
      if (recent) throw new Error("Please allow a moment between messages");
      const [post] = await tx.insert(s.studyGroupPosts).values({
        groupId: group.id, authorPersonId: actor.actorPersonId, body,
      }).returning({ id: s.studyGroupPosts.id });
      if (!post) throw new Error("Post could not be created");
      await recordAudit(tx, actor, {
        action: "study_group.post.create", resourceType: "study_group_post",
        resourceId: post.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { groupId: group.id, authorPersonId: actor.actorPersonId,
          characterCount: body.length },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupPostCreated, aggregateType: "study_group_post",
        aggregateId: post.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id },
      });
      return { postId: post.id };
    });
  });

export const reportCanonicalGroupPost = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    groupId: uuid, postId: uuid, reason: z.string().trim().min(5).max(1000),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    return db.transaction(async tx => {
      // Match resolution's group-before-post lock order, including FK checks.
      const group = await participatingStudent(tx, actor, data.groupId, true);
      // Serialize reports on the post so duplicate rapid requests cannot
      // create separate open moderation Actions.
      const [post] = await tx.select().from(s.studyGroupPosts)
        .where(and(eq(s.studyGroupPosts.id, data.postId),
          eq(s.studyGroupPosts.groupId, data.groupId),
          eq(s.studyGroupPosts.hidden, false))).for("update").limit(1);
      if (!post) throw new Error("Post not available");
      const [existing] = await tx.select({ id: s.studyGroupReports.id })
        .from(s.studyGroupReports).where(and(
          eq(s.studyGroupReports.groupId, group.id),
          eq(s.studyGroupReports.postId, post.id),
          eq(s.studyGroupReports.reporterPersonId, actor.actorPersonId),
          eq(s.studyGroupReports.status, "open"))).limit(1);
      if (existing) return { reportId: existing.id, created: false };
      const [report] = await tx.insert(s.studyGroupReports).values({
        groupId: group.id, reporterPersonId: actor.actorPersonId,
        postId: post.id, reason: data.reason.trim(),
      }).returning({ id: s.studyGroupReports.id });
      if (!report) throw new Error("Report could not be created");
      // Moderation actions are organization-scoped so operations staff retain
      // visibility above the site (ported from the legacy report path).
      const [site] = await tx.select({ organizationId: s.sites.organizationId })
        .from(s.sites).where(eq(s.sites.id, group.siteId!)).limit(1);
      if (!site) throw new Error("Study group site unavailable");
      const [action] = await tx.insert(s.actions).values({
        type: "study_group_moderation", status: "open", priority: "high",
        title: "Review reported content in " + group.title,
        description: "A student reported content requiring facilitator review.",
        ownerPersonId: group.facilitatorPersonId,
        organizationId: site.organizationId, siteId: group.siteId,
        programId: group.programId,
        subjectType: "study_group_report", subjectId: report.id,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { groupId: group.id, postId: post.id },
      }).returning({ id: s.actions.id });
      if (!action) throw new Error("Moderation Action could not be created");
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated, aggregateType: "action",
        aggregateId: action.id, actorPersonId: actor.actorPersonId,
        payload: { subjectType: "study_group_report", subjectId: report.id,
          groupId: group.id },
      });
      await notify(tx, {
        recipientPersonId: group.facilitatorPersonId,
        type: "study_group_report_submitted", title: "Study group content reported",
        body: "A study group post needs moderation.", resourceType: "study_group",
        resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: "study_group.post.report", resourceType: "study_group_report",
        resourceId: report.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { groupId: group.id, postId: post.id, actionId: action.id },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupPostReported, aggregateType: "study_group_report",
        aggregateId: report.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, postId: post.id },
      });
      return { reportId: report.id, created: true };
    });
  });

export const resolveCanonicalGroupReport = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    reportId: uuid, hidePost: z.boolean(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    return db.transaction(async tx => {
      const [owner] = await tx.select({ groupId: s.studyGroupReports.groupId })
        .from(s.studyGroupReports).where(eq(s.studyGroupReports.id, data.reportId)).limit(1);
      if (!owner) throw new Error("Report not found");
      const group = await facilitatedGroup(tx, actor, owner.groupId);
      const [report] = await tx.select().from(s.studyGroupReports)
        .where(and(eq(s.studyGroupReports.id, data.reportId),
          eq(s.studyGroupReports.groupId, group.id),
          eq(s.studyGroupReports.status, "open"))).for("update").limit(1);
      if (!report) throw new Error("Report already handled");
      if (data.hidePost && report.postId) {
        await tx.update(s.studyGroupPosts).set({
          hidden: true, updatedAt: new Date(),
        }).where(and(eq(s.studyGroupPosts.id, report.postId),
          eq(s.studyGroupPosts.groupId, group.id)));
      }
      await tx.update(s.studyGroupReports).set({ status: "resolved" })
        .where(eq(s.studyGroupReports.id, report.id));
      // Close each open moderation Action individually so every resolved
      // Action emits its own ActionResolved lifecycle event (ported from the
      // legacy resolve path).
      const openActions = await tx.select({ id: s.actions.id })
        .from(s.actions).where(and(eq(s.actions.type, "study_group_moderation"),
          eq(s.actions.subjectType, "study_group_report"),
          eq(s.actions.subjectId, report.id),
          inArray(s.actions.status, ["open", "in_progress", "waiting"])));
      for (const open of openActions) {
        const [closed] = await tx.update(s.actions).set({
          status: "resolved", resolvedAt: new Date(),
          resolutionNote: data.hidePost ? "Content hidden" : "Report reviewed, content retained",
          updatedAt: new Date(),
        }).where(and(eq(s.actions.id, open.id),
          inArray(s.actions.status, ["open", "in_progress", "waiting"])))
          .returning({ id: s.actions.id });
        if (closed) await emitEvent(tx, {
          eventType: EventTypes.ActionResolved, aggregateType: "action",
          aggregateId: closed.id, actorPersonId: actor.actorPersonId,
          payload: { subjectType: "study_group_report", subjectId: report.id,
            groupId: group.id },
        });
      }
      await notify(tx, {
        recipientPersonId: report.reporterPersonId,
        type: "study_group_report_resolved", title: "Study group report reviewed",
        body: data.hidePost ? "Reported content was hidden." : "Your report was reviewed.",
        resourceType: "study_group", resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: "study_group.report.resolve", resourceType: "study_group_report",
        resourceId: report.id, scope: { siteId: group.siteId, programId: group.programId },
        before: { status: "open" }, after: { status: "resolved", hidden: data.hidePost },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupReportResolved, aggregateType: "study_group_report",
        aggregateId: report.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, postId: report.postId, hidden: data.hidePost },
      });
      return { saved: true };
    });
  });
