import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { validateGroupPost } from "@/domain/study-groups";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { facilitatedGroup, participatingStudent } from "./canonical-membership.server";

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
      const [post] = await tx.insert(s.studyGroupPosts).values({
        groupId: group.id, authorPersonId: actor.actorPersonId, body,
      }).returning({ id: s.studyGroupPosts.id });
      if (!post) throw new Error("Post could not be created");
      await recordAudit(tx, actor, {
        action: "study_group.post.create", resourceType: "study_group_post",
        resourceId: post.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { groupId: group.id, authorPersonId: actor.actorPersonId },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "StudyGroupPostCreated", aggregateType: "study_group_post",
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
      // Serialize reports on the post so duplicate rapid requests cannot
      // create separate open moderation Actions.
      const [post] = await tx.select().from(s.studyGroupPosts)
        .where(and(eq(s.studyGroupPosts.id, data.postId),
          eq(s.studyGroupPosts.groupId, data.groupId),
          eq(s.studyGroupPosts.hidden, false))).for("update").limit(1);
      if (!post) throw new Error("Post not available");
      const group = await participatingStudent(tx, actor, data.groupId);
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
      await tx.insert(s.actions).values({
        type: "study_group_moderation", status: "open", priority: "high",
        title: "Review reported content in " + group.title,
        description: "A student reported content requiring facilitator review.",
        ownerPersonId: group.facilitatorPersonId, siteId: group.siteId,
        programId: group.programId,
        subjectType: "study_group_report", subjectId: report.id,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { groupId: group.id, postId: post.id },
      });
      await tx.insert(s.notifications).values({
        recipientPersonId: group.facilitatorPersonId, status: "unread",
        type: "study_group_report_submitted", title: "Study group content reported",
        body: "A study group post needs moderation.", resourceType: "study_group",
        resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: "study_group.post.report", resourceType: "study_group_report",
        resourceId: report.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { groupId: group.id, postId: post.id },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "StudyGroupPostReported", aggregateType: "study_group_report",
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
      await tx.update(s.actions).set({
        status: "resolved", resolvedAt: new Date(),
        resolutionNote: data.hidePost ? "Content hidden" : "Report reviewed, content retained",
        updatedAt: new Date(),
      }).where(and(eq(s.actions.type, "study_group_moderation"),
        eq(s.actions.subjectType, "study_group_report"),
        eq(s.actions.subjectId, report.id),
        sql`${s.actions.status} in ('open', 'in_progress', 'waiting')`));
      await tx.insert(s.notifications).values({
        recipientPersonId: report.reporterPersonId, status: "unread",
        type: "study_group_report_resolved", title: "Study group report reviewed",
        body: data.hidePost ? "Reported content was hidden." : "Your report was reviewed.",
        resourceType: "study_group", resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: "study_group.report.resolve", resourceType: "study_group_report",
        resourceId: report.id, scope: { siteId: group.siteId, programId: group.programId },
        before: { status: "open" }, after: { status: "resolved", hidden: data.hidePost },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "StudyGroupReportResolved", aggregateType: "study_group_report",
        aggregateId: report.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, postId: report.postId, hidden: data.hidePost },
      });
      return { saved: true };
    });
  });
